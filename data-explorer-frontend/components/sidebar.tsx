"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Upload, Table, BarChart3, MessageSquare, ExternalLink, Database, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/ingestion", label: "Ingestion", icon: Upload },
  { href: "/view-data", label: "View Data", icon: Table },
  { href: "/cleaned-data", label: "Cleaned Data", icon: Database },
  { href: "/column-analysis", label: "Column Analysis", icon: TrendingUp },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/ai-analyst", label: "AI Analyst", icon: MessageSquare },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 p-6">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold text-lg">
          A
        </div>
        <div>
          <div className="font-bold text-foreground tracking-wide">AVANTE</div>
          <div className="text-xs text-primary tracking-widest">SOFT BI</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname === "/" && item.href === "/ingestion")
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Exit to Site */}
      <div className="px-4 mb-4">
        <button className="flex items-center gap-3 px-4 py-3 text-sm text-sidebar-foreground hover:text-foreground transition-colors w-full">
          <ExternalLink className="w-5 h-5" />
          EXIT TO SITE
        </button>
      </div>

      {/* Live Analysis Panel */}
      <div className="mx-4 mb-6 p-4 rounded-xl bg-gradient-to-br from-primary to-cyan-400">
        <div className="text-xs font-bold text-primary-foreground tracking-wider mb-1">LIVE ANALYSIS</div>
        <div className="text-xs text-primary-foreground/90 mb-2">Connected to ERP Cluster</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary-foreground animate-pulse" />
          <span className="text-xs font-semibold text-primary-foreground tracking-wide">STREAMING DATA</span>
        </div>
      </div>
    </aside>
  )
}
