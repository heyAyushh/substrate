import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

const SOCIETY_CORE_SCRIPT_PATH = "/society_core.js"
const LOCAL_AGENTATION_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])
const shouldLoadAgentation =
  import.meta.env.DEV ||
  (LOCAL_AGENTATION_HOSTS.has(window.location.hostname) &&
    new URLSearchParams(window.location.search).has("agentation"))
const AgentationToolbar = shouldLoadAgentation
  ? lazy(async () => {
      const { Agentation } = await import("agentation")
      return { default: Agentation }
    })
  : undefined

const loadSocietyCore = () =>
  new Promise<void>((resolve, reject) => {
    if ((window as { TrustSubstrateSociety?: unknown }).TrustSubstrateSociety) {
      resolve()
      return
    }

    const script = document.createElement("script")
    script.src = SOCIETY_CORE_SCRIPT_PATH
    script.async = false
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Society core did not load."))
    document.head.appendChild(script)
  })

await loadSocietyCore()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="trust-substrate-theme-v2">
      <App />
      {AgentationToolbar ? (
        <Suspense fallback={null}>
          <AgentationToolbar />
        </Suspense>
      ) : null}
    </ThemeProvider>
  </StrictMode>
)
