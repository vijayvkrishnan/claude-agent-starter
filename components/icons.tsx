/**
 * Hand-rolled inline SVG icons. Avoiding lucide-react keeps the dep tree
 * small and gives us pixel-level control over stroke widths.
 */

interface IconProps {
  readonly className?: string;
  readonly size?: number;
}

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function InboxIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </svg>
  );
}

export function CheckSquareIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function FolderIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function CommandIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

export function SearchIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function SparkIcon({ className, size }: IconProps): React.ReactElement {
  // 4-point spark, used as the agent indicator. More distinctive than a star.
  return (
    <svg className={className} {...base(size)} fill="currentColor" stroke="none">
      <path d="M12 2 L13.5 9.5 L21 11 L13.5 12.5 L12 20 L10.5 12.5 L3 11 L10.5 9.5 Z" />
    </svg>
  );
}

export function ToolIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function ChevronRightIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function CloseIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function ArrowReturnIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function CircleDashedIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="12" cy="12" r="10" strokeDasharray="4 3" />
    </svg>
  );
}

export function BlockIcon({ className, size }: IconProps): React.ReactElement {
  return (
    <svg className={className} {...base(size)}>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.93 4.93 14.14 14.14" />
    </svg>
  );
}
