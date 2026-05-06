import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createLiveSocietySession,
  finalizeLiveSocietySession,
  peekNextSocietyAction,
  readLiveSocietyFrame,
} = require("./society_core.js") as {
  createLiveSocietySession: (input: unknown) => SocietySimulationSession;
  finalizeLiveSocietySession: (
    session: SocietySimulationSession,
  ) => SocietyResult;
  peekNextSocietyAction: (
    session: SocietySimulationSession,
  ) => SocietyPendingTransition | undefined;
  readLiveSocietyFrame: (session: SocietySimulationSession) => SocietyFrame;
};

type SocietyCell = {
  x: number;
  y: number;
};

type SocietyAgent = SocietyCell & {
  id: string;
  name: string;
};

type SocietyFrame = {
  tick: number;
  agents: SocietyAgent[];
};

type SocietyEvent = {
  id: string;
  tick: number;
  agentId: string;
  agentName?: string;
  actorIdentityId?: string;
  action: string;
  receiptKind?: string;
  tokenDelta?: number;
  cell: SocietyCell;
  counterpartyId?: string;
  parentIds?: string[];
  note?: string;
  payloadExtras?: Record<string, unknown>;
};

type SocietyReceipt = {
  receiptId: string;
  sequence?: number;
  actorId?: string;
  actorName?: string;
  taskId?: string;
  kind?: string;
  domain?: string;
  previousReceiptId?: string;
  payloadHash: string;
  payload?: Record<string, unknown>;
  slot?: number;
};

type SocietyResult = {
  runId: string;
  config: {
    agents: number;
    ticks: number;
  };
  events: SocietyEvent[];
  receipts: SocietyReceipt[];
  timeline: SocietyFrame[];
};

type SocietySimulationSession = {
  config: SocietyResult["config"];
  events: SocietyEvent[];
  receipts: SocietyReceipt[];
  timeline: SocietyFrame[];
};

type SocietyPendingTransition = {
  event: SocietyEvent;
  receipt: SocietyReceipt;
  frame: SocietyFrame;
  completed?: boolean;
  session: SocietySimulationSession;
};

type ChainOperationResult = {
  address: string;
  signature: string;
  slot: number;
};

type LiveProofReference = {
  id: string;
  url: string;
  hash: string;
  status: string;
  file: string;
};

type LiveSnapshot = {
  sessionId: string;
  status: "paused" | "running" | "complete";
  config: SocietyResult["config"];
  confirmedFrame: SocietyFrame;
  pendingFrame?: SocietyFrame;
  pendingAction?: SocietyEvent;
  confirmedEvents: SocietyEvent[];
  confirmedReceipts: SocietyReceipt[];
  committedActions: Array<
    ChainOperationResult & {
      eventId: string;
      action: string;
      tick: number;
      agentId: string;
    }
  >;
  proof?: LiveProofReference;
  lastError?: string;
};

type LiveMessage = {
  type: "snapshot" | "pending" | "confirmed" | "error" | "complete";
  snapshot: LiveSnapshot;
};

type LiveSessionRecord<TChainSession> = {
  id: string;
  simulation: SocietySimulationSession;
  chainSession: TChainSession;
  status: "paused" | "running" | "complete";
  autoPlay: boolean;
  stepping: boolean;
  subscribers: Set<(message: LiveMessage) => void>;
  pendingTransition?: SocietyPendingTransition;
  lastConfirmedFrame: SocietyFrame;
  committedActions: LiveSnapshot["committedActions"];
  proof?: LiveProofReference;
  timer?: NodeJS.Timeout;
  lastError?: string;
};

type SocietyLiveManagerDependencies<TChainSession> = {
  createChainSession(input: {
    sessionId: string;
    runId: string;
    simulation: SocietyResult;
  }): Promise<TChainSession>;
  commitGenesisAction(input: {
    sessionId: string;
    chainSession: TChainSession;
    event: SocietyEvent;
    receipt: SocietyReceipt;
  }): Promise<ChainOperationResult>;
  commitLiveAction(input: {
    sessionId: string;
    chainSession: TChainSession;
    event: SocietyEvent;
    receipt: SocietyReceipt;
    frame: SocietyFrame;
    simulation: SocietySimulationSession;
  }): Promise<ChainOperationResult>;
  finalizeChainSession(input: {
    sessionId: string;
    chainSession: TChainSession;
    simulation: SocietyResult;
  }): Promise<{
    proof?: LiveProofReference;
    audit?: ChainOperationResult;
  }>;
  syncChainSessionState(input: {
    sessionId: string;
    chainSession: TChainSession;
    simulation: SocietySimulationSession;
    completed: boolean;
  }): Promise<SocietySimulationSession>;
  autoPlaySessions?: boolean;
  stepDelayMs?: number;
};

const currentFrame = (session: SocietySimulationSession) =>
  readLiveSocietyFrame(session);

const buildSnapshot = <TChainSession>(
  session: LiveSessionRecord<TChainSession>,
): LiveSnapshot => ({
  sessionId: session.id,
  status: session.status,
  config: session.simulation.config,
  confirmedFrame: session.lastConfirmedFrame,
  pendingFrame: session.pendingTransition?.frame,
  pendingAction: session.pendingTransition?.event,
  confirmedEvents: session.simulation.events,
  confirmedReceipts: session.simulation.receipts,
  committedActions: session.committedActions,
  proof: session.proof,
  lastError: session.lastError,
});

const broadcast = <TChainSession>(
  session: LiveSessionRecord<TChainSession>,
  type: LiveMessage["type"],
) => {
  const message = {
    type,
    snapshot: buildSnapshot(session),
  } satisfies LiveMessage;
  for (const subscriber of session.subscribers) {
    subscriber(message);
  }
};

export const createSocietyLiveManager = <TChainSession>(
  dependencies: SocietyLiveManagerDependencies<TChainSession>,
) => {
  const sessions = new Map<string, LiveSessionRecord<TChainSession>>();
  let latestSessionId: string | undefined;
  const shouldAutoPlaySessions = dependencies.autoPlaySessions ?? true;

  const getSession = (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Live session ${sessionId} does not exist`);
    }
    return session;
  };

  const pauseOpenSessions = () => {
    for (const session of sessions.values()) {
      if (session.status === "complete") continue;
      session.autoPlay = false;
      if (session.timer) clearTimeout(session.timer);
      session.timer = undefined;
      if (session.status !== "paused") {
        session.status = "paused";
        broadcast(session, "snapshot");
      }
    }
  };

  const finalizeSession = async (session: LiveSessionRecord<TChainSession>) => {
    if (session.status === "complete") return buildSnapshot(session);

    const simulation = finalizeLiveSocietySession(session.simulation);
    const finalized = await dependencies.finalizeChainSession({
      sessionId: session.id,
      chainSession: session.chainSession,
      simulation,
    });
    if (finalized.audit) {
      session.committedActions.push({
        ...finalized.audit,
        eventId: "audit_receipt_live_complete",
        action: "audit",
        tick: session.lastConfirmedFrame.tick,
        agentId: "society_commons",
      });
    }
    session.proof = finalized.proof;
    session.status = "complete";
    session.autoPlay = false;
    if (session.timer) clearTimeout(session.timer);
    session.timer = undefined;
    broadcast(session, "complete");
    return buildSnapshot(session);
  };

  const schedulePlayback = async (
    session: LiveSessionRecord<TChainSession>,
  ) => {
    if (
      !session.autoPlay ||
      session.status === "complete" ||
      session.stepping
    ) {
      return;
    }

    session.timer = setTimeout(async () => {
      try {
        const progressed = await manager.stepSession(session.id);
        if (progressed && session.autoPlay) {
          await schedulePlayback(session);
        }
      } catch {
        session.autoPlay = false;
        session.status = "paused";
      }
    }, dependencies.stepDelayMs ?? 0);
  };

  const manager = {
    async startSession(config: unknown) {
      const simulation = createLiveSocietySession(config);
      const initialResult = finalizeLiveSocietySession(simulation);
      const sessionId = `live_${randomUUID().replaceAll("-", "")}`;
      const chainSession = await dependencies.createChainSession({
        sessionId,
        runId: initialResult.runId,
        simulation: initialResult,
      });

      for (const [index, event] of simulation.events.entries()) {
        await dependencies.commitGenesisAction({
          sessionId,
          chainSession,
          event,
          receipt: simulation.receipts[index],
        });
      }
      const committedSimulation = await dependencies.syncChainSessionState({
        sessionId,
        chainSession,
        simulation,
        completed: false,
      });

      const session: LiveSessionRecord<TChainSession> = {
        id: sessionId,
        simulation: committedSimulation,
        chainSession,
        status: shouldAutoPlaySessions ? "running" : "paused",
        autoPlay: shouldAutoPlaySessions,
        stepping: false,
        subscribers: new Set(),
        lastConfirmedFrame: currentFrame(committedSimulation),
        committedActions: [],
      };
      pauseOpenSessions();
      sessions.set(sessionId, session);
      latestSessionId = sessionId;

      if (session.autoPlay) {
        void schedulePlayback(session);
      }

      return {
        sessionId,
        snapshot: buildSnapshot(session),
      };
    },

    getSessionSnapshot(sessionId: string) {
      return buildSnapshot(getSession(sessionId));
    },

    getLatestSessionSnapshot() {
      if (!latestSessionId) return undefined;
      return buildSnapshot(getSession(latestSessionId));
    },

    getSession(sessionId: string) {
      return getSession(sessionId);
    },

    subscribe(sessionId: string, subscriber: (message: LiveMessage) => void) {
      const session = getSession(sessionId);
      session.subscribers.add(subscriber);
      subscriber({
        type: "snapshot",
        snapshot: buildSnapshot(session),
      });
      return () => {
        session.subscribers.delete(subscriber);
      };
    },

    async playSession(sessionId: string) {
      const session = getSession(sessionId);
      if (session.status === "complete") {
        return buildSnapshot(session);
      }
      session.autoPlay = true;
      session.status = "running";
      await schedulePlayback(session);
      return buildSnapshot(session);
    },

    pauseSession(sessionId: string) {
      const session = getSession(sessionId);
      session.autoPlay = false;
      if (session.timer) clearTimeout(session.timer);
      session.timer = undefined;
      if (session.status !== "complete") {
        session.status = "paused";
      }
      return buildSnapshot(session);
    },

    async stepSession(sessionId: string) {
      const session = getSession(sessionId);
      if (session.status === "complete") {
        return false;
      }
      if (session.stepping) {
        return false;
      }

      const preview = peekNextSocietyAction(session.simulation);
      if (!preview) {
        await finalizeSession(session);
        return false;
      }

      session.stepping = true;
      session.pendingTransition = preview;
      session.lastError = undefined;
      broadcast(session, "pending");

      try {
        const committed = await dependencies.commitLiveAction({
          sessionId,
          chainSession: session.chainSession,
          event: preview.event,
          receipt: preview.receipt,
          frame: preview.frame,
          simulation: preview.session,
        });
        const committedSimulation = await dependencies.syncChainSessionState({
          sessionId,
          chainSession: session.chainSession,
          simulation: preview.session,
          completed: Boolean(preview.completed),
        });

        session.simulation = committedSimulation;
        session.lastConfirmedFrame = currentFrame(committedSimulation);
        session.pendingTransition = undefined;
        session.committedActions.push({
          ...committed,
          eventId: preview.event.id,
          action: preview.event.action,
          tick: preview.event.tick,
          agentId: preview.event.agentId,
        });

        if (preview.completed) {
          await finalizeSession(session);
        } else {
          if (!session.autoPlay) {
            session.status = "paused";
          }
          broadcast(session, "confirmed");
        }
        return true;
      } catch (error) {
        session.pendingTransition = undefined;
        session.status = "paused";
        session.autoPlay = false;
        session.lastError = (error as Error).message;
        broadcast(session, "error");
        throw error;
      } finally {
        session.stepping = false;
      }
    },
  };

  return manager;
};
