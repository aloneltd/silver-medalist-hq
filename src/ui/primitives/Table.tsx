import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

/** Dense table primitives — Bench/Board list views build on these instead of raw <table>
 * markup, so column alignment, hover rows and sticky headers stay consistent app-wide. */

export function Table({ className = '', ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="smhq-table-scroll">
      <table className={`smhq-table ${className}`} {...rest} />
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="smhq-thead">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ selected, ...rest }: HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return <tr className={`smhq-tr ${selected ? 'smhq-tr-selected' : ''} ${rest.className ?? ''}`} {...rest} />;
}

export function TH({ className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`smhq-th ${className}`} {...rest} />;
}

export function TD({ className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`smhq-td ${className}`} {...rest} />;
}
