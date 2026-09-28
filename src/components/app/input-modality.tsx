"use client";

import { useEffect } from "react";

// Notes whether the owner is using the keyboard or a pointer, as
// <html data-input="keyboard|pointer">. WebKit stops treating a radio as
// :focus-visible once arrow keys change the selection, which would hide the
// focus ring on Pingflow's radio chips; with this, they keep it (see
// .radio-chip in globals.css).
export function InputModality() {
  useEffect(() => {
    const root = document.documentElement;
    const keyboard = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) root.dataset.input = "keyboard";
    };
    const pointer = () => {
      root.dataset.input = "pointer";
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  return null;
}
