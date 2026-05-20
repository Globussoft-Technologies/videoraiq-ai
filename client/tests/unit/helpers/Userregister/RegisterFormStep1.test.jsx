/**
 * RegisterFormStep1 — a Formik-driven first step of the user register form.
 * It uses ui/select (Radix Select wrapper) for Location and Department. We
 * mock the @radix-ui/react-select primitive so Select renders inline without
 * a Portal / pointer machinery.
 */
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Formik, Form } from "formik";

vi.mock("@radix-ui/react-select", () => {
  const make = (name) => ({ children, onValueChange, ...rest }) => {
    // The wrapper passes onValueChange on the Root; expose it through a
    // data-onValueChange-attached-button so tests can drive it deterministically.
    return React.createElement(
      "div",
      {
        "data-mock-name": name,
        // attach onValueChange so we can call it from tests
        "data-has-onvaluechange": Boolean(onValueChange),
        ...rest,
      },
      onValueChange
        ? React.createElement(
            "button",
            {
              "data-testid": `${name}-fire`,
              type: "button",
              onClick: () => onValueChange("__fired__"),
            },
            "fire"
          )
        : null,
      children
    );
  };
  return {
    Root: make("Root"),
    Group: make("Group"),
    Value: make("Value"),
    Trigger: make("Trigger"),
    Icon: ({ children }) => <>{children}</>,
    Portal: ({ children }) => <>{children}</>,
    Content: make("Content"),
    Viewport: make("Viewport"),
    Label: make("Label"),
    Item: make("Item"),
    ItemIndicator: make("ItemIndicator"),
    ItemText: make("ItemText"),
    Separator: make("Separator"),
  };
});

const { default: RegisterFormStep1 } = await import(
  "@/helpers/Userregister/RegisterFormStep1.jsx"
);

const DEPARTMENTS = [
  { _id: "d1", departmentName: "Engineering" },
  { _id: "d2", departmentName: "Sales" },
];

function wrap(ui, initialValues = {}, onSubmit = vi.fn()) {
  return render(
    <Formik
      initialValues={{
        firstName: "",
        lastName: "",
        email: "",
        designation: "",
        location: "",
        departmentId: "",
        ...initialValues,
      }}
      onSubmit={onSubmit}
    >
      <Form>{ui}</Form>
    </Formik>
  );
}

describe("RegisterFormStep1", () => {
  it("renders all six labeled inputs", () => {
    wrap(<RegisterFormStep1 departments={DEPARTMENTS} locations={["Bangalore"]} />);
    expect(screen.getByText("First Name*")).toBeInTheDocument();
    expect(screen.getByText("Last Name*")).toBeInTheDocument();
    expect(screen.getByText("Email*")).toBeInTheDocument();
    expect(screen.getByText("Designation*")).toBeInTheDocument();
    expect(screen.getByText("Location")).toBeInTheDocument();
    expect(screen.getByText("Department*")).toBeInTheDocument();
  });

  it("renders placeholder text inside the input fields", () => {
    const { container } = wrap(
      <RegisterFormStep1 departments={DEPARTMENTS} locations={["Bangalore"]} />
    );
    expect(container.querySelector('input[name="firstName"]')).not.toBeNull();
    expect(
      container.querySelector('input[name="firstName"]').getAttribute("placeholder")
    ).toBe("Enter First Name");
    expect(
      container.querySelector('input[name="lastName"]').getAttribute("placeholder")
    ).toBe("Enter Last Name");
    expect(
      container.querySelector('input[name="email"]').getAttribute("placeholder")
    ).toBe("Enter Email");
    expect(
      container.querySelector('input[name="designation"]').getAttribute("placeholder")
    ).toBe("Enter Designation");
  });

  it("displays the supplied departments as items", () => {
    wrap(<RegisterFormStep1 departments={DEPARTMENTS} locations={[]} />);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Sales")).toBeInTheDocument();
  });

  it("renders the 'no options' message when departments is empty", () => {
    wrap(<RegisterFormStep1 departments={[]} locations={["Hyderabad"]} />);
    // Both Location (no values + locations=['Hyderabad'] -> 1 option) and
    // Department (empty -> "No options available")
    const placeholders = screen.getAllByText(/No options available/);
    expect(placeholders.length).toBe(1); // only Department
  });

  it("renders the 'no options' message for Location when locations is empty", () => {
    wrap(<RegisterFormStep1 departments={[]} locations={[]} />);
    const placeholders = screen.getAllByText(/No options available/);
    // Both Location and Department show the message
    expect(placeholders.length).toBe(2);
  });

  it("renders locations, deduped against the existing value", () => {
    wrap(
      <RegisterFormStep1 departments={DEPARTMENTS} locations={["Bangalore", "Chennai"]} />,
      { location: "Bangalore" }
    );
    // 'Bangalore' appears exactly once (deduped) plus 'Chennai' once
    const bangalore = screen.getAllByText("Bangalore");
    expect(bangalore.length).toBe(1);
    expect(screen.getByText("Chennai")).toBeInTheDocument();
  });

  it("normalises 'banglore' (typo) to 'Bangalore' when rendering location options", () => {
    wrap(
      <RegisterFormStep1
        departments={DEPARTMENTS}
        locations={["banglore", "Mumbai"]}
      />
    );
    // 'banglore' in the list is rendered as 'Bangalore'
    expect(screen.getByText("Bangalore")).toBeInTheDocument();
    expect(screen.getByText("Mumbai")).toBeInTheDocument();
  });

  it("prepends the current location value when not present in the supplied list", () => {
    wrap(
      <RegisterFormStep1 departments={DEPARTMENTS} locations={["Mumbai"]} />,
      { location: "Delhi" }
    );
    expect(screen.getByText("Delhi")).toBeInTheDocument();
    expect(screen.getByText("Mumbai")).toBeInTheDocument();
  });

  it("the location Select's onValueChange wires into setFieldValue('location', ...)", () => {
    const { container } = wrap(
      <RegisterFormStep1 departments={DEPARTMENTS} locations={["Mumbai"]} />
    );
    // The first Root represents Location. Fire its onValueChange.
    const roots = container.querySelectorAll('[data-mock-name="Root"]');
    const fireBtns = container.querySelectorAll('[data-testid="Root-fire"]');
    expect(fireBtns.length).toBe(2);
    act(() => {
      fireEvent.click(fireBtns[0]);
    });
    // The form's location is updated; the option for "__fired__" was prepended
    // because Formik values.location is now "__fired__".
    expect(screen.getByText("__fired__")).toBeInTheDocument();
  });

  it("the department Select's onValueChange wires into setFieldValue('departmentId', ...)", () => {
    const { container } = wrap(
      <RegisterFormStep1 departments={DEPARTMENTS} locations={["Mumbai"]} />,
      { departmentId: "d1" }
    );
    const fireBtns = container.querySelectorAll('[data-testid="Root-fire"]');
    // Second one is the Department select
    act(() => {
      fireEvent.click(fireBtns[1]);
    });
    // departmentId in Formik is now "__fired__" — the SelectValue's `value`
    // prop on the Root reflects that
    const roots = container.querySelectorAll('[data-mock-name="Root"]');
    expect(roots[1].getAttribute("value")).toBe("__fired__");
  });

  it("does not crash when locations prop is omitted (defaults to [])", () => {
    wrap(<RegisterFormStep1 departments={DEPARTMENTS} />);
    expect(screen.getByText("Location")).toBeInTheDocument();
  });
});
