"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import ConnectedApp from "../src/ConnectedApp";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is required.");
const convex = new ConvexReactClient(convexUrl);

export default function HomePage() {
  return <ConvexProvider client={convex}><ConnectedApp /></ConvexProvider>;
}
