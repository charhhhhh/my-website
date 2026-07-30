import type { Statement } from "@/lib/contest";

/**
 * Problem statements are injected as captured HTML on purpose.
 *
 * Codeforces renders all maths with MathJax, so the live DOM contains generated
 * <span class="MathJax">…</span> trees plus hidden MathML - thousands of nodes per
 * statement whose exact structure the MathJax CSS (and the TeX webfonts mirrored into
 * public/mathjax.codeforces.org/) depends on. Reconstructing that as JSX would break the
 * formulae, and the LaTeX source is not recoverable from the rendered page.
 *
 * The .problemindexholder > .ttypography wrapper chain is reproduced from the live page:
 * ttypography.css is what supplies the statement's colour (#222), 21px line-height and
 * word-wrap: break-word. Without it the text renders pure black and does not wrap.
 */
export function ProblemStatement({ statement }: { statement: Statement }) {
  return (
    <div className="problemindexholder" {...{ problemindex: statement.index }}>
      <div
        className="ttypography"
        dangerouslySetInnerHTML={{ __html: statement.html }}
      />
    </div>
  );
}
