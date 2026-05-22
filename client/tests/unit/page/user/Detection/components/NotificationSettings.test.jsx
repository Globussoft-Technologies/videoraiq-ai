/**
 * src/page/user/Detection/components/NotificationSettings.jsx — reads
 * the appliedProfileData from InnerSettingsContext and renders a small
 * notification summary. Mocks: 0 (we feed the provider directly).
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import NotificationSettings from "../../../../../../src/page/user/Detection/components/NotificationSettings.jsx";
import { InnerSettingsProvider } from "../../../../../../src/page/user/Detection/components/InnerSettingsContext.jsx";

const renderWithProfile = (appliedProfileData) =>
  render(
    <InnerSettingsProvider value={{ appliedProfileData }}>
      <NotificationSettings />
    </InnerSettingsProvider>
  );

describe("NotificationSettings", () => {
  it("renders the section heading", () => {
    renderWithProfile({});
    expect(screen.getByText("Notification")).toBeInTheDocument();
    expect(screen.getByText("Notify")).toBeInTheDocument();
    expect(screen.getByText("Channels")).toBeInTheDocument();
  });

  it("renders the notify value when present", () => {
    renderWithProfile({
      profile: { notification: { notify: "On Detection", channels: {} } },
    });
    expect(screen.getByText("On Detection")).toBeInTheDocument();
  });

  it("hides the Digest Interval block when digestEveryMinutes is absent", () => {
    renderWithProfile({
      profile: { notification: { notify: "x", channels: {} } },
    });
    expect(screen.queryByText("Digest Interval")).not.toBeInTheDocument();
  });

  it("shows the Digest Interval and its value when present", () => {
    renderWithProfile({
      profile: {
        notification: {
          notify: "x",
          digestEveryMinutes: 15,
          channels: {},
        },
      },
    });
    expect(screen.getByText("Digest Interval")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("applies the active style to a channel that is true in the profile", () => {
    const { container } = renderWithProfile({
      profile: {
        notification: { channels: { email: true, push: false } },
      },
    });
    // The two rendered channel buttons in order are email then push.
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    // Active channel uses the dark slate background class.
    expect(buttons[0].className).toContain("bg-[#07486A]");
    // Inactive channel uses the white border style.
    expect(buttons[1].className).toContain("bg-white");
  });

  it("does not throw when appliedProfileData is undefined", () => {
    render(
      <InnerSettingsProvider value={{ appliedProfileData: undefined }}>
        <NotificationSettings />
      </InnerSettingsProvider>
    );
    expect(screen.getByText("Notification")).toBeInTheDocument();
  });
});
