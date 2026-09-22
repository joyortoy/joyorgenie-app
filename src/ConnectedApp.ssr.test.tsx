// @vitest-environment node
import { renderToString } from "react-dom/server";
import { it, expect } from "vitest";
import ConnectedApp from "./ConnectedApp";
it("renders without accessing browser storage on the server", () => {
  expect(renderToString(<ConnectedApp />)).toContain(
    "Opening your private workspace",
  );
});
