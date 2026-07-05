import React from "react";

type Props = React.SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, ...props }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function IconDashboard(props: Props) {
  return (
    <Svg {...props}>
      <path d="M3 3h8v8H3z" />
      <path d="M13 3h8v5h-8z" />
      <path d="M13 10h8v11h-8z" />
      <path d="M3 13h8v8H3z" />
    </Svg>
  );
}

export function IconPieChart(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 2v10l8.66 5A10 10 0 1 1 12 2z" />
      <path d="M12 2a10 10 0 0 1 10 10h-10V2z" />
    </Svg>
  );
}

export function IconFileText(props: Props) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h2" />
    </Svg>
  );
}

export function IconUser(props: Props) {
  return (
    <Svg {...props}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  );
}

export function IconBell(props: Props) {
  return (
    <Svg {...props}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

export function IconBarcode(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 5v14" />
      <path d="M8 5v14" />
      <path d="M12 5v14" />
      <path d="M16 5v14" />
      <path d="M20 7v10" />
    </Svg>
  );
}

export function IconCart(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 2-1.6L23 6H6" />
    </Svg>
  );
}

export function IconScan(props: Props) {
  return (
    <Svg {...props}>
      <path d="M4 7V5a2 2 0 0 1 2-2h2" />
      <path d="M20 7V5a2 2 0 0 0-2-2h-2" />
      <path d="M4 17v2a2 2 0 0 0 2 2h2" />
      <path d="M20 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 12h10" />
    </Svg>
  );
}

export function IconPlus(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconSettings(props: Props) {
  return (
    <Svg {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2.2 2.2 0 0 1-1.56 3.76h-.17a1.8 1.8 0 0 0-1.74 1.2l-.05.17a2.2 2.2 0 0 1-4.18 0l-.05-.17A1.8 1.8 0 0 0 10.3 22h-.17a2.2 2.2 0 0 1-1.56-3.76l.06-.06A1.8 1.8 0 0 0 9 15.01a1.8 1.8 0 0 0-1.2-1.74l-.17-.05a2.2 2.2 0 0 1 0-4.18l.17-.05A1.8 1.8 0 0 0 9 7.3a1.8 1.8 0 0 0-.36-1.98l-.06-.06A2.2 2.2 0 0 1 10.13 1.5h.17A1.8 1.8 0 0 0 12.04.3l.05-.17a2.2 2.2 0 0 1 4.18 0l.05.17A1.8 1.8 0 0 0 18.13 1.5h.17a2.2 2.2 0 0 1 1.56 3.76l-.06.06A1.8 1.8 0 0 0 19 7.29c0 .75.46 1.42 1.2 1.74l.17.05a2.2 2.2 0 0 1 0 4.18l-.17.05A1.8 1.8 0 0 0 19.4 15z" />
    </Svg>
  );
}

export function IconLogOut(props: Props) {
  return (
    <Svg {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}
