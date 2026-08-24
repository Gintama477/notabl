"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type ConnectTransition = {
  /** True from the moment a connect is submitted until fresh server data arrives. */
  connecting: boolean;
  beginConnect: () => void;
  endConnect: () => void;
};

const Ctx = createContext<ConnectTransition>({
  connecting: false,
  beginConnect: () => {},
  endConnect: () => {},
});

export function useConnectTransition() {
  return useContext(Ctx);
}

/**
 * Marks the window between "customer submitted their Place ID" and "the
 * dashboard has re-rendered with their real data".
 *
 * That window used to display three contradictory things at once, at the
 * worst possible moment — seconds after someone paid. The metric tiles
 * said "Reviews Analyzed 45 / 100", server-rendered from demo reviews that
 * connectGoogleReviewSource had just deleted; the banner still said
 * "you're viewing example reviews"; and the connect card said "imported 17
 * reviews". Every one of those was rendered from a different snapshot of
 * the truth.
 *
 * Anything reading server-rendered demo state subscribes to this and hides
 * itself while it's true. Nothing is more informative than a number that
 * is now describing deleted rows.
 *
 * Resets itself when hasDemoData flips false — that's the signal the
 * refresh landed and the page is showing real data. Doing it via the
 * server value rather than a timer means the suppression lasts exactly as
 * long as the stale window does, whether that's fast or slow. router
 * .refresh() re-renders the server tree but PRESERVES client state, so
 * without this reset the suppression would never lift.
 */
export function ConnectTransitionProvider({
  hasDemoData,
  children,
}: {
  hasDemoData: boolean;
  children: ReactNode;
}) {
  const [connectRequested, setConnectRequested] = useState(false);

  // Derived, not synced in an effect. hasDemoData turning false IS the
  // signal that fresh server data arrived, so ANDing against it ends the
  // transition automatically — no effect, no cascading render, and no way
  // for the suppression to get stuck on if a reset were ever missed.
  const connecting = connectRequested && hasDemoData;

  return (
    <Ctx.Provider
      value={{
        connecting,
        beginConnect: () => setConnectRequested(true),
        endConnect: () => setConnectRequested(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
