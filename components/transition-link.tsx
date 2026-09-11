"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes } from "react";

type Props = LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

export function TransitionLink({ children, ...props }: Props) {
  return <Link {...props}>{children}</Link>;
}
