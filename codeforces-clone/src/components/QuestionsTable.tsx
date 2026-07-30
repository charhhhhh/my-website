import { contestData } from "@/lib/contest";
import { DataTableBox } from "./DataTableBox";

/**
 * "Questions about problems" - the contest announcements feed.
 *
 * Codeforces stripes with `dark` on even rows and marks the final row `bottom` (which is
 * what rounds off the table's bottom corners). The `monospaced` /
 * `question-requestText-td` classes are what left-align these cells and give them the
 * monospace face - dropping them makes the text inherit the header's centring.
 */
export function QuestionsTable() {
  const { questions } = contestData;
  if (questions.length === 0) return null;

  const rowClass = (i: number) =>
    i === questions.length - 1 ? "bottom" : i % 2 === 0 ? "dark" : "";

  return (
    <div style={{ marginTop: "2em" }}>
      {/* Empty 2em spacer that sits above the questions table on the live page - it
          holds the (logged-in only) "Ask a question" action link. Omitting it made
          #pageContent ~19px shorter than the original. */}
      <div className="action-link" style={{ position: "relative", height: "2em" }} />
      <DataTableBox caption="Questions about problems">
        <table className="problem-questions-table">
          <tbody>
            <tr>
              <th className="top left" style={{ width: "2em" }} />
              <th className="top">Question</th>
              <th className="top right">Answer</th>
            </tr>
            {questions.map((q, i) => {
              const rc = rowClass(i);
              return (
                <tr
                  key={i}
                  className="problem-question broadcast-question"
                  style={{ fontWeight: "bold" }}
                >
                  <td className={`${rc} left`} style={{ fontSize: "65%" }}>
                    {q.time}
                    <br />
                  </td>
                  <td
                    className={`question-requestText-td monospaced ${rc}`}
                    dangerouslySetInnerHTML={{ __html: q.questionHtml }}
                  />
                  <td
                    className={`question-requestText-td question-response-td monospaced ${rc} right`}
                    dangerouslySetInnerHTML={{ __html: q.answerHtml }}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </DataTableBox>
    </div>
  );
}
