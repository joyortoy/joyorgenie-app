import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import ConnectedApp from "./ConnectedApp";
import "./styles.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is required. Run `npx convex dev` first.");
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <ConnectedApp />
    </ConvexProvider>
  </StrictMode>,
);
