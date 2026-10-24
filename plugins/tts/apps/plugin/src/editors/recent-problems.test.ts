import { RECENT_PROBLEMS_KEPT } from "tts-protocol";
import { describe, expect, it, vi } from "vitest";

import { RecentProblems } from "./recent-problems";

function drop(text: string) {
  return { kind: "voice-missing", reason: "No voice Milena on this Mac", text };
}

describe("RecentProblems", () => {
  it("is empty once the plugin starts", () => {
    expect(new RecentProblems(() => {}).list).toEqual([]);
  });

  it("lists every dropped Phrase newest first, with when it was dropped, and says so each time", () => {
    const onChange = vi.fn();
    let now = 1000;
    const problems = new RecentProblems(onChange, () => now);

    problems.add(drop("first"));
    now = 2000;
    problems.add(drop("second"));

    expect(problems.list).toEqual([
      { id: 2, at: 2000, ...drop("second") },
      { id: 1, at: 1000, ...drop("first") },
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it(`keeps the last ${RECENT_PROBLEMS_KEPT}`, () => {
    const problems = new RecentProblems(() => {});

    for (let n = 1; n <= RECENT_PROBLEMS_KEPT + 5; n++) {
      problems.add(drop(`#${n}`));
    }

    expect(problems.list).toHaveLength(RECENT_PROBLEMS_KEPT);
    expect(problems.list[0].text).toBe(`#${RECENT_PROBLEMS_KEPT + 5}`);
    expect(problems.list.at(-1)?.text).toBe("#6");
  });
});
