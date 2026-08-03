import type { ReactNode } from "react";

type Props = {
  id?: string;
  title: string;
  /** public/oc/icon/NN.png 的編號 */
  icon: number;
  status?: string;
  statusRight?: string;
  className?: string;
  children: ReactNode;
};

/** 一個不能拖曳、但長得很像 Win98/XP 的視窗外框。 */
export default function Win({
  id,
  title,
  icon,
  status,
  statusRight,
  className = "",
  children,
}: Props) {
  return (
    <section id={id} className={`win ${className}`}>
      <div className="win__bar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="win__ico" src={`/oc/icon/${icon}.png`} alt="" />
        <h2 className="win__title">{title}</h2>
        <div className="win__btns" aria-hidden="true">
          <span className="win__btn">_</span>
          <span className="win__btn">□</span>
          <span className="win__btn win__btn--x">✕</span>
        </div>
      </div>
      <div className="win__body">
        {children}
        {status && (
          <div className="win__status">
            <span>{status}</span>
            {statusRight && <span>{statusRight}</span>}
          </div>
        )}
      </div>
    </section>
  );
}
