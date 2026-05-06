import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"
import { ThemeProvider } from "@/components/theme-provider.tsx"

const SOCIETY_CORE_SCRIPT_PATH = "/society_core.js"

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
    </ThemeProvider>
  </StrictMode>
)
