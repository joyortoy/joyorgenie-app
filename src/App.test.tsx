import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("JoyOrGenie vertical slice", () => {
  it("turns the returning-user massage intent into an approval-gated journey", () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText("Tell Genie what you want to do"), {
      target: { value: "I want a massage this Saturday afternoon somewhere near me." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask Genie" }));
    act(() => vi.advanceTimersByTime(3_200));

    expect(screen.getByText("Thai massage · rated 9/10 · within 15 min")).toBeInTheDocument();
    expect(screen.getByText("Siam Stillness")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Approval required" })).toBeInTheDocument();
    expect(screen.queryByText("Your Saturday reset is on the calendar.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Approve & continue/ }));
    expect(screen.getByText("Your Saturday reset is on the calendar.")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("lets the user inspect and remove a memory", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Memory" }));

    const memory = screen.getByText("You enjoy Thai massage");
    expect(memory).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove You enjoy Thai massage" }));
    expect(memory).not.toBeInTheDocument();
  });
});
