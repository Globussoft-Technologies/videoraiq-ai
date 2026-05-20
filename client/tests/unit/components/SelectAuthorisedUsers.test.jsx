/**
 * SelectAuthorisedUsers fetches users on mount and renders a multi-select
 * dropdown. We mock the network call (authorizedUsers) so we can drive
 * what the component sees. We assert on:
 *   - the empty/placeholder state before any selection
 *   - the rendered Badge list for selected users
 *   - the (id, value) contract of onChange for select / deselect / select-all
 *     / clear-all
 *   - that the dropdown is hidden until the trigger is clicked
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const authorizedUsersMock = vi.hoisted(() => vi.fn());
vi.mock("@/page/user/Dashboard/Api/get", () => ({
  authorizedUsers: authorizedUsersMock,
}));

import SelectAuthorisedUsers from "../../../src/components/SelectAuthorisedUsers.jsx";

const USERS = [
  { _id: "u1", firstName: "Alice", lastName: "Anderson", email: "alice@example.com" },
  { _id: "u2", firstName: "Bob", lastName: "Brown", email: "bob@example.com" },
  { _id: "u3", firstName: "Carol", lastName: "Carter", email: "carol@example.com" },
];

function mockSuccess(users = USERS) {
  authorizedUsersMock.mockResolvedValue({
    body: { status: "success", data: { users } },
  });
}

// Names in the rendered tree are split across multiple text nodes
// ("Alice", " ", "Anderson"), so getByText("Alice Anderson") never
// matches. Use a function matcher that compares normalized textContent.
const byFullText = (needle) => (_, node) =>
  !!node && node.textContent.replace(/\s+/g, " ").trim() === needle;

beforeEach(() => {
  authorizedUsersMock.mockReset();
});

describe("SelectAuthorisedUsers", () => {
  it("shows the placeholder text when nothing is selected", async () => {
    mockSuccess();
    render(<SelectAuthorisedUsers value={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());
    expect(screen.getByText("Choose Authorised Users")).toBeInTheDocument();
  });

  it("renders a Badge for each selected user", async () => {
    mockSuccess();
    const { container } = render(
      <SelectAuthorisedUsers value={["u1", "u3"]} onChange={vi.fn()} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    // Badges live in the trigger row (sibling of .authorised-users-dropdown).
    // Each user's name lives in a Badge's <span class="truncate ...">.
    const dropdown = container.querySelector(".authorised-users-dropdown");
    const trigger = dropdown.previousElementSibling;
    const badgeNames = Array.from(trigger.querySelectorAll("span.truncate")).map(
      (n) => n.textContent.replace(/\s+/g, " ").trim()
    );
    expect(badgeNames).toContain("Alice Anderson");
    expect(badgeNames).toContain("Carol Carter");
    expect(badgeNames).not.toContain("Bob Brown");
    expect(badgeNames).toHaveLength(2);
  });

  it("keeps the dropdown list hidden until the trigger is clicked", async () => {
    mockSuccess();
    const { container } = render(
      <SelectAuthorisedUsers value={[]} onChange={vi.fn()} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    const dropdown = container.querySelector(".authorised-users-dropdown");
    expect(dropdown).not.toBeNull();
    expect(dropdown.classList.contains("hidden")).toBe(true);

    fireEvent.click(screen.getByText("Choose Authorised Users"));
    expect(dropdown.classList.contains("hidden")).toBe(false);
  });

  it("opening the dropdown lists every fetched user with their email", async () => {
    mockSuccess();
    const { container } = render(
      <SelectAuthorisedUsers value={[]} onChange={vi.fn()} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Choose Authorised Users"));

    const dropdown = container.querySelector(".authorised-users-dropdown");
    await waitFor(() => {
      expect(within(dropdown).getAllByText(byFullText("Alice Anderson")).length).toBeGreaterThan(0);
    });
    expect(within(dropdown).getByText("alice@example.com")).toBeInTheDocument();
    expect(within(dropdown).getByText("bob@example.com")).toBeInTheDocument();
    expect(within(dropdown).getByText("carol@example.com")).toBeInTheDocument();
  });

  it("Select All emits every user id", async () => {
    mockSuccess();
    const onChange = vi.fn();
    render(<SelectAuthorisedUsers value={[]} onChange={onChange} />);
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Choose Authorised Users"));
    const selectAll = await screen.findByText(/Select All/i);
    fireEvent.click(selectAll);
    expect(onChange).toHaveBeenCalledWith(["u1", "u2", "u3"]);
  });

  it("Clear All emits an empty array", async () => {
    mockSuccess();
    const onChange = vi.fn();
    const { container } = render(
      <SelectAuthorisedUsers value={["u1", "u2"]} onChange={onChange} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    // The trigger row contains the badges; click it to open the dropdown.
    const trigger = container.querySelector(".relative > .relative > div");
    fireEvent.click(trigger);

    const clearAll = await screen.findByText(/Clear All/i);
    fireEvent.click(clearAll);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("clicking an unselected user adds their id to the value", async () => {
    mockSuccess();
    const onChange = vi.fn();
    const { container } = render(
      <SelectAuthorisedUsers value={["u1"]} onChange={onChange} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    const trigger = container.querySelector(".relative > .relative > div");
    fireEvent.click(trigger);

    // Click the row containing Bob Brown
    const dropdown = container.querySelector(".authorised-users-dropdown");
    const bobNameEl = await within(dropdown).findByText(byFullText("Bob Brown"));
    fireEvent.click(bobNameEl);
    expect(onChange).toHaveBeenCalledWith(["u1", "u2"]);
  });

  it("clicking an already-selected user removes their id from the value", async () => {
    mockSuccess();
    const onChange = vi.fn();
    const { container } = render(
      <SelectAuthorisedUsers value={["u1", "u2"]} onChange={onChange} />
    );
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    const trigger = container.querySelector(".relative > .relative > div");
    fireEvent.click(trigger);

    const dropdown = container.querySelector(".authorised-users-dropdown");
    const aliceNameEl = await within(dropdown).findByText(byFullText("Alice Anderson"));
    fireEvent.click(aliceNameEl);
    expect(onChange).toHaveBeenCalledWith(["u2"]);
  });

  it("falls back to an empty list when the API rejects", async () => {
    authorizedUsersMock.mockRejectedValue(new Error("boom"));
    render(<SelectAuthorisedUsers value={[]} onChange={vi.fn()} />);
    await waitFor(() => expect(authorizedUsersMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText("Choose Authorised Users"));
    await waitFor(() =>
      expect(screen.getByText(/No users found/i)).toBeInTheDocument()
    );
  });

  it("passes skip / limit through to the API call", async () => {
    mockSuccess();
    render(
      <SelectAuthorisedUsers value={[]} onChange={vi.fn()} skip={20} limit={5} />
    );
    await waitFor(() =>
      expect(authorizedUsersMock).toHaveBeenCalledWith(20, 5)
    );
  });
});
