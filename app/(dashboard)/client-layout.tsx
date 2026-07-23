"use client";

import { useState, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  FileInput,
  FileOutput,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Wrench,
  Building2,
  UserCircle,
  Ruler,
  Tags,
  MapPin,
  Search,
  FileSpreadsheet,
  Menu,
  X,
  Layers,
} from "lucide-react";
import Link from "next/link";

// Sidebar context for collapse state
const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}>({ collapsed: false, setCollapsed: () => {} });

export function useSidebar() {
  return useContext(SidebarContext);
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  module?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: <Package className="h-5 w-5" />,
    children: [
      {
        label: "Goods Receipt (GRN)",
        href: "/inventory/grn",
        icon: <FileInput className="h-4 w-4" />,
        module: "INWARD_RECORD",
      },
      {
        label: "Material Issue (MIS)",
        href: "/inventory/mis",
        icon: <FileOutput className="h-4 w-4" />,
        module: "OUTWARD_RECORD",
      },
      {
        label: "Store Log",
        href: "/inventory/store-log",
        icon: <ClipboardList className="h-4 w-4" />,
        module: "STORE_LOG",
      },
    ],
  },
  {
    label: "Masters",
    href: "/masters",
    icon: <Layers className="h-5 w-5" />,
    children: [
      {
        label: "Products",
        href: "/masters/products",
        icon: <Wrench className="h-4 w-4" />,
        module: "HARDWARE_MASTER",
      },
      {
        label: "Categories",
        href: "/masters/categories",
        icon: <Tags className="h-4 w-4" />,
        module: "HARDWARE_MASTER",
      },
      {
        label: "Suppliers",
        href: "/masters/suppliers",
        icon: <Building2 className="h-4 w-4" />,
        module: "SUPPLIER_MASTER",
      },
      {
        label: "Staff",
        href: "/masters/staff",
        icon: <UserCircle className="h-4 w-4" />,
        module: "STAFF_MASTER",
      },
      {
        label: "Units",
        href: "/masters/units",
        icon: <Ruler className="h-4 w-4" />,
        module: "HARDWARE_MASTER",
      },
      {
        label: "Attributes",
        href: "/masters/attributes",
        icon: <Tags className="h-4 w-4" />,
        module: "HARDWARE_MASTER",
      },
      {
        label: "Bins",
        href: "/masters/bins",
        icon: <MapPin className="h-4 w-4" />,
        module: "HARDWARE_MASTER",
      },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: <FileSpreadsheet className="h-5 w-5" />,
    module: "REPORTS",
  },
  {
    label: "Import / Export",
    href: "/import-export",
    icon: <FileSpreadsheet className="h-5 w-5" />,
  },
  {
    label: "Users",
    href: "/users",
    icon: <Users className="h-5 w-5" />,
    module: "USER_MANAGEMENT",
  },
  {
    label: "Audit Log",
    href: "/audit-log",
    icon: <Shield className="h-5 w-5" />,
  },
];

function NavLink({
  item,
  collapsed,
  depth = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  depth?: number;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  const [open, setOpen] = useState(isActive);
  const hasChildren = item.children && item.children.length > 0;

  if (hasChildren && !collapsed) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? "bg-sidebar-active text-primary-foreground"
              : "text-sidebar-foreground hover:bg-sidebar-hover"
          }`}
        >
          {item.icon}
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronRight
            className={`h-4 w-4 transition-transform ${
              open ? "rotate-90" : ""
            }`}
          />
        </button>
        {open && (
          <div className="mt-1 ml-4 space-y-0.5 border-l border-sidebar-hover pl-3">
            {item.children!.map((child) => (
              <NavLink
                key={child.href}
                item={child}
                collapsed={collapsed}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        depth > 0 ? "py-1.5" : ""
      } ${
        isActive
          ? "bg-sidebar-active text-primary-foreground font-medium"
          : "text-sidebar-foreground hover:bg-sidebar-hover"
      }`}
    >
      {item.icon}
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

function Sidebar({ filteredNavItems }: { filteredNavItems: NavItem[] }) {
  const { collapsed, setCollapsed } = useSidebar();
  const router = useRouter();
  const { data: session } = useSession();

  async function handleLogout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-full flex-col glass-sidebar transition-all duration-300 lg:relative lg:z-auto ${
          collapsed ? "w-0 -translate-x-full lg:w-16 lg:translate-x-0" : "w-72"
        }`}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-hover px-4">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
                <Wrench className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-sidebar-foreground">
                  Hardware ERP
                </p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground lg:block"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {filteredNavItems.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} />
            ))}
          </div>
        </nav>

        {/* User section */}
        {!collapsed && session?.user && (
          <div className="border-t border-sidebar-hover p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-hover text-xs font-medium text-sidebar-foreground">
                {session.user.name
                  ?.split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2) || "U"}
              </div>
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {session.user.name}
                </p>
                <p className="truncate text-[11px] text-sidebar-muted">
                  {session.user.email}
                </p>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="rounded-lg p-1.5 text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function TopBar() {
  const { setCollapsed } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border/50 glass px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={() => setCollapsed(false)}
        className="mr-4 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Header text on mobile */}
      <div className="flex-1 lg:hidden">
        <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-indigo-600">
          Hardware ERP
        </h1>
      </div>

      {/* Search bar */}
      <div className="hidden lg:flex flex-1 items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search products, SKU, suppliers... (Ctrl+K)"
            className="w-full rounded-full border border-input bg-white/50 py-2 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20 transition-colors shadow-sm"
          />
        </div>
      </div>
    </header>
  );
}

export default function DashboardLayout({
  children,
  allowedModules,
}: {
  children: React.ReactNode;
  allowedModules: string[];
}) {
  const [collapsed, setCollapsed] = useState(true); // Start collapsed on mobile

  // Filter items based on permissions
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items
      .map((item) => {
        if (item.children) {
          const filteredChildren = filterNavItems(item.children);
          return { ...item, children: filteredChildren };
        }
        return item;
      })
      .filter((item) => {
        if (item.children && item.children.length === 0) return false;
        if (!item.module) return true; // Always show things like Dashboard without specific modules
        if (allowedModules.includes("ALL")) return true;
        return allowedModules.includes(item.module);
      });
  };

  const filteredNavItems = filterNavItems(navItems);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar filteredNavItems={filteredNavItems} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
