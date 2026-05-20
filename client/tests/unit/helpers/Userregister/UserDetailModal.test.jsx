/**
 * UserDetailModal renders a user's profile details + an image carousel.
 * `@/components/ui/dialog` ultimately wraps @radix-ui/react-dialog; we mock
 * the primitive so the modal content renders inline (no Portal).
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@radix-ui/react-dialog", () => {
  const make = (name) => ({ children, ...rest }) =>
    React.createElement("div", { "data-mock-name": name, ...rest }, children);
  return {
    Root: make("Root"),
    Trigger: make("Trigger"),
    Portal: ({ children }) => <>{children}</>,
    Close: make("Close"),
    Overlay: make("Overlay"),
    Content: make("Content"),
    Title: make("Title"),
    Description: make("Description"),
  };
});

const { UserDetailModal, UserDetailModalContent, default: Default } =
  await import("@/helpers/Userregister/UserDetailModal.jsx");

const baseUser = {
  firstName: "Alice",
  lastName: "Smith",
  userName: "asmith",
  emp_id: "EMP-001",
  email: "alice@example.com",
  designation: "Engineer",
  location: "Bangalore",
  departmentId: { departmentName: "R&D" },
  address1: "1 Main St",
  profilePics: [],
};

describe("UserDetailModal", () => {
  it("default export equals the named UserDetailModal", () => {
    expect(Default).toBe(UserDetailModal);
  });

  it("renders the loading placeholder when no user is provided", () => {
    const { container } = render(
      <UserDetailModal user={null} isOpen={true} onClose={() => {}} nasUrl="" />
    );
    expect(container.textContent).toContain("Loading details...");
  });

  it("renders user details when a user is supplied", () => {
    const { container } = render(
      <UserDetailModal user={baseUser} isOpen={true} onClose={() => {}} nasUrl="" />
    );
    // "Alice Smith" appears both in sr-only title and the main display - check
    // we have at least one
    expect(screen.getAllByText(/Alice Smith/i).length).toBeGreaterThan(0);
    expect(container.textContent).toContain("@asmith");
    expect(container.textContent).toContain("EMP-001");
    expect(container.textContent).toContain("alice@example.com");
    expect(container.textContent).toContain("Engineer");
    expect(container.textContent).toContain("Bangalore");
    expect(container.textContent).toContain("R&D");
    expect(container.textContent).toContain("1 Main St");
  });

  it("renders 'username' fallback when userName is missing", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, userName: undefined }}
        isOpen={true}
        onClose={() => {}}
        nasUrl=""
      />
    );
    expect(container.textContent).toContain("@username");
  });

  it("falls back to 'N/A' for missing detail fields", () => {
    render(
      <UserDetailModal
        user={{ firstName: "Bob", lastName: "" }}
        isOpen={true}
        onClose={() => {}}
        nasUrl=""
      />
    );
    // emp_id missing -> ID: N/A
    expect(screen.getAllByText(/N\/A/).length).toBeGreaterThan(0);
  });

  it("uses an svg-data-url placeholder when no profilePics are present", () => {
    const { container } = render(
      <UserDetailModal user={baseUser} isOpen={true} onClose={() => {}} nasUrl="" />
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("uses nasUrl + filename when profilePics is non-empty", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, profilePics: ["pic1.jpg"] }}
        isOpen={true}
        onClose={() => {}}
        nasUrl="https://nas"
      />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toBe(
      "https://nas/api/v1/uploads/pic1.jpg"
    );
  });

  it("img onError swaps to the initials placeholder", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, profilePics: ["broken.jpg"] }}
        isOpen={true}
        onClose={() => {}}
        nasUrl="https://nas"
      />
    );
    const img = container.querySelector("img");
    fireEvent.error(img);
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });

  it("shows prev/next nav and pagination dots when more than one picture exists", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, profilePics: ["a.jpg", "b.jpg", "c.jpg"] }}
        isOpen={true}
        onClose={() => {}}
        nasUrl="https://nas"
      />
    );
    // There should be two arrow buttons + a close (mobile) button = at least 3
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("Next button cycles forward through the carousel", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, profilePics: ["a.jpg", "b.jpg", "c.jpg"] }}
        isOpen={true}
        onClose={() => {}}
        nasUrl="https://nas"
      />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toContain("a.jpg");

    const buttons = Array.from(container.querySelectorAll("button"));
    // First two are prev/next arrows (in DOM order: prev then next)
    const nextBtn = buttons[1];
    fireEvent.click(nextBtn);
    expect(img.getAttribute("src")).toContain("b.jpg");
    fireEvent.click(nextBtn);
    expect(img.getAttribute("src")).toContain("c.jpg");
    // Cycles back to first
    fireEvent.click(nextBtn);
    expect(img.getAttribute("src")).toContain("a.jpg");
  });

  it("Prev button cycles backward and wraps from index 0", () => {
    const { container } = render(
      <UserDetailModal
        user={{ ...baseUser, profilePics: ["a.jpg", "b.jpg"] }}
        isOpen={true}
        onClose={() => {}}
        nasUrl=""
      />
    );
    const img = container.querySelector("img");
    const buttons = Array.from(container.querySelectorAll("button"));
    const prevBtn = buttons[0];
    fireEvent.click(prevBtn);
    expect(img.getAttribute("src")).toContain("b.jpg");
    fireEvent.click(prevBtn);
    expect(img.getAttribute("src")).toContain("a.jpg");
  });

  it("clicking the mobile close button invokes onClose", () => {
    const onClose = vi.fn();
    const { container } = render(
      <UserDetailModal
        user={baseUser}
        isOpen={true}
        onClose={onClose}
        nasUrl=""
      />
    );
    // The mobile X button is the last button in DOM order (no carousel arrows)
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[buttons.length - 1]);
    expect(onClose).toHaveBeenCalled();
  });

  it("UserDetailModalContent can be exercised directly", () => {
    const { container } = render(
      <UserDetailModalContent
        user={baseUser}
        nasUrl=""
        onClose={() => {}}
      />
    );
    expect(container.textContent).toContain("Alice Smith");
  });

  it("handles a user with empty first/last initials (forces fallback char)", () => {
    const { container } = render(
      <UserDetailModalContent
        user={{ firstName: "", lastName: "" }}
        nasUrl=""
        onClose={() => {}}
      />
    );
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
  });
});
