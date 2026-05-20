/**
 * RegisterFormStep2 is a small uploader UI driven by formik context. We mock
 * formik + sonner and exercise: counter text, click-from-files (valid/invalid
 * file types), Take Photo, and Remove image.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

const formikValues = vi.hoisted(() => ({ firstName: "  Sumit  " }));
const useFormikContextMock = vi.hoisted(() =>
  vi.fn(() => ({ values: { firstName: "  Sumit  " } }))
);
vi.mock("formik", () => ({ useFormikContext: useFormikContextMock }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));

const RegisterFormStep2 = (
  await import("../../../../src/helpers/Userregister/RegisterFormStep2.jsx")
).default;

const baseProps = () => ({
  uploadedImagePaths: ["", "", ""],
  uploadedImageUrls: [],
  onRemoveImage: vi.fn(),
  onUploadFile: vi.fn(),
  onOpenCamera: vi.fn(),
});

beforeEach(() => {
  toastError.mockReset();
  useFormikContextMock.mockReturnValue({ values: { firstName: "  Sumit  " } });
});

describe("RegisterFormStep2", () => {
  it("renders three upload tiles and the 0/3 counter when nothing is uploaded", () => {
    render(<RegisterFormStep2 {...baseProps()} />);
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
    expect(screen.getByText("Left")).toBeInTheDocument();
    expect(screen.getByText(/Uploaded 0 \/ 3 images/)).toBeInTheDocument();
    expect(screen.getAllByText(/Click From Files/i)).toHaveLength(3);
    expect(screen.getAllByText(/Take Photo/i)).toHaveLength(3);
  });

  it("renders an <img> per uploaded path and lets you click-remove it", () => {
    const props = {
      ...baseProps(),
      uploadedImagePaths: ["/img-front.jpg", "", ""],
      uploadedImageUrls: ["https://cdn/example/front.jpg"],
    };
    const { container } = render(<RegisterFormStep2 {...props} />);
    expect(container.querySelectorAll("img")).toHaveLength(1);
    // The single remove button is the only X button inside the uploaded tile
    const removeBtn = container.querySelector("button.bg-red-500");
    fireEvent.click(removeBtn);
    expect(props.onRemoveImage).toHaveBeenCalledWith(0);
  });

  it("counts only non-empty strings in the uploaded counter", () => {
    render(
      <RegisterFormStep2
        {...baseProps()}
        uploadedImagePaths={["/a.jpg", "", "/c.jpg"]}
      />
    );
    expect(screen.getByText(/Uploaded 2 \/ 3 images/)).toBeInTheDocument();
  });

  it("Take Photo invokes onOpenCamera with the angle label", () => {
    const props = baseProps();
    render(<RegisterFormStep2 {...props} />);
    fireEvent.click(screen.getAllByText(/Take Photo/i)[1]); // Right
    expect(props.onOpenCamera).toHaveBeenCalledWith("Right");
  });

  it("uploading a valid JPEG forwards file + trimmed firstName + index to onUploadFile", () => {
    const props = baseProps();
    const { container } = render(<RegisterFormStep2 {...props} />);
    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs).toHaveLength(3);
    const file = new File(["abc"], "front.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInputs[0], { target: { files: [file] } });
    expect(props.onUploadFile).toHaveBeenCalledTimes(1);
    expect(props.onUploadFile).toHaveBeenCalledWith(file, "Sumit", 0);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("rejects non-image MIME types via toast.error and never calls onUploadFile", () => {
    const props = baseProps();
    const { container } = render(<RegisterFormStep2 {...props} />);
    const fileInputs = container.querySelectorAll('input[type="file"]');
    const bad = new File(["x"], "bad.pdf", { type: "application/pdf" });
    fireEvent.change(fileInputs[0], { target: { files: [bad] } });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError.mock.calls[0][0]).toMatch(/JPG or PNG/i);
    expect(props.onUploadFile).not.toHaveBeenCalled();
  });

  it("noop when no file is selected (e.g. user cancels native picker)", () => {
    const props = baseProps();
    const { container } = render(<RegisterFormStep2 {...props} />);
    const fileInputs = container.querySelectorAll('input[type="file"]');
    fireEvent.change(fileInputs[0], { target: { files: [] } });
    expect(props.onUploadFile).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
