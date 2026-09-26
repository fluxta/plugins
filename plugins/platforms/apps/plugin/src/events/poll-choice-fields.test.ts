import { describe, expect, it } from "vitest";

import { choiceTitleFields, choiceVoteFields, winningChoiceTitle } from "./poll-choice-fields";

describe("choiceTitleFields", () => {
  it("spreads titles onto the five numbered slots", () => {
    expect(choiceTitleFields([{ title: "Yes" }, { title: "No" }])).toEqual({
      choice1: "Yes",
      choice2: "No",
      choice3: "",
      choice4: "",
      choice5: "",
    });
  });

  it("fills every slot when the poll used all five", () => {
    const choices = ["A", "B", "C", "D", "E"].map((title) => ({ title }));

    expect(choiceTitleFields(choices)).toEqual({
      choice1: "A",
      choice2: "B",
      choice3: "C",
      choice4: "D",
      choice5: "E",
    });
  });
});

describe("choiceVoteFields", () => {
  it("spreads vote counts onto the five numbered slots, unused ones reporting zero", () => {
    expect(choiceVoteFields([{ totalVotes: 12 }, { totalVotes: 7 }])).toEqual({
      choice1Votes: 12,
      choice2Votes: 7,
      choice3Votes: 0,
      choice4Votes: 0,
      choice5Votes: 0,
    });
  });
});

describe("winningChoiceTitle", () => {
  it("names the choice with the most votes", () => {
    const choices = [
      { title: "Yes", totalVotes: 3 },
      { title: "No", totalVotes: 9 },
      { title: "Maybe", totalVotes: 5 },
    ];

    expect(winningChoiceTitle(choices)).toBe("No");
  });

  it("resolves a tie to whichever choice came first", () => {
    const choices = [
      { title: "First", totalVotes: 4 },
      { title: "Second", totalVotes: 4 },
    ];

    expect(winningChoiceTitle(choices)).toBe("First");
  });

  it("reports nothing for a poll with no choices, rather than throwing", () => {
    expect(winningChoiceTitle([])).toBe("");
  });
});
