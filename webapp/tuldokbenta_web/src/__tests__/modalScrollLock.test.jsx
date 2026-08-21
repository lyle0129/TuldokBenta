/**
 * Subject: components/shared/Modal.jsx — body scroll lock
 *
 * Dialogs in this app overlap: an edit sheet raises a confirm prompt, the cart
 * raises an unclaimed-freebie warning. Each Modal used to save
 * document.body.style.overflow on open and write it back on close, so the second
 * to open captured "hidden" from the first and whichever closed last restored
 * *that*. The page then could not be scrolled until the app was reloaded.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import Modal from "../components/shared/Modal";
import ConfirmDialog from "../components/shared/ConfirmDialog";

afterEach(() => {
  document.body.style.overflow = "";
});

const overflow = () => document.body.style.overflow;

describe("Modal body scroll lock", () => {
  it("locks while open and releases on close", () => {
    const { rerender } = render(
      <Modal open onClose={vi.fn()} title="One">
        body
      </Modal>
    );
    expect(overflow()).toBe("hidden");

    rerender(
      <Modal open={false} onClose={vi.fn()} title="One">
        body
      </Modal>
    );
    expect(overflow()).toBe("");
  });

  it("releases when the dialog unmounts entirely", () => {
    const { unmount } = render(
      <Modal open onClose={vi.fn()} title="One">
        body
      </Modal>
    );
    expect(overflow()).toBe("hidden");

    unmount();
    expect(overflow()).toBe("");
  });

  // The reported bug: the page stayed stuck and only a refresh fixed it.
  it("stays locked until the last of two overlapping dialogs closes", () => {
    const Two = ({ sheet, confirm }) => (
      <>
        <Modal open={sheet} onClose={vi.fn()} title="Sheet">
          body
        </Modal>
        <ConfirmDialog
          open={confirm}
          title="Sure?"
          message="…"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </>
    );

    const { rerender } = render(<Two sheet confirm={false} />);
    expect(overflow()).toBe("hidden");

    rerender(<Two sheet confirm />);
    expect(overflow()).toBe("hidden");

    // Both close in the same commit — "Save Anyway" dismisses the prompt and the
    // sheet at once. The sheet's cleanup runs first, so the prompt's used to run
    // second and put "hidden" straight back.
    rerender(<Two sheet={false} confirm={false} />);
    expect(overflow()).toBe("");
  });

  it("keeps the lock when only the inner dialog closes", () => {
    const Two = ({ confirm }) => (
      <>
        <Modal open onClose={vi.fn()} title="Sheet">
          body
        </Modal>
        <ConfirmDialog
          open={confirm}
          title="Sure?"
          message="…"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </>
    );

    const { rerender } = render(<Two confirm />);
    expect(overflow()).toBe("hidden");

    // Going back to the sheet must not hand scrolling back to the page behind.
    rerender(<Two confirm={false} />);
    expect(overflow()).toBe("hidden");
  });

  // onClose is an inline arrow at nearly every call site, so it changes identity
  // on every render of the parent.
  it("survives a parent re-render that reassigns onClose", () => {
    const Wrapper = ({ label }) => (
      <Modal open onClose={() => {}} title={label}>
        body
      </Modal>
    );

    const { rerender } = render(<Wrapper label="One" />);
    rerender(<Wrapper label="Two" />);
    rerender(<Wrapper label="Three" />);

    expect(overflow()).toBe("hidden");
  });

  it("restores a page that was already unscrollable before any dialog opened", () => {
    document.body.style.overflow = "clip";

    const { unmount } = render(
      <Modal open onClose={vi.fn()} title="One">
        body
      </Modal>
    );
    expect(overflow()).toBe("hidden");

    unmount();
    expect(overflow()).toBe("clip");
  });

  it("still closes on Escape after the effects were split apart", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="One">
        body
      </Modal>
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("still closes on a backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="One">
        body
      </Modal>
    );

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement);
    expect(onClose).toHaveBeenCalled();
  });
});
