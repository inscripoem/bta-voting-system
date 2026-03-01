"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import {
    Sheet,
    SheetContent,
    SheetTrigger,
    SheetTitle,
} from "@/components/ui/sheet"
import { NavActions } from "@/components/nav-actions"

interface MenuItem {
  title: string
  href?: string
  items?: SubMenuItem[]
}

interface SubMenuItem {
  title: string
  href: string
  description?: string
}

const menuItems: MenuItem[] = [
  {
    title: "首页",
    href: "/"
  },
  {
    title: "参与投票",
    href: "/vote"
  },
  {
    title: "结果公布",
    href: "/results"
  },
  {
    title: "关于大二杯",
    href: "/about"
  },
]

export function SiteHeader() {
  const [open, setOpen] = React.useState(false)
  
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 md:px-8">
        {/* 左侧 Logo 和标题 */}
        <div className="flex items-center gap-2">
          <Link href="/" onClick={() => setOpen(false)}>
            <Image
              src="/logo.webp"
              alt="Logo"
              width={32}
              height={32}
              className=""
            />
          </Link>
          <Link href="/" onClick={() => setOpen(false)} className="font-bold text-xl">
            大二杯
          </Link>
        </div>

        {/* 移动端菜单按钮 */}
        <div className="flex flex-1 items-center justify-end md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetTitle>导航菜单</SheetTitle>
              <nav className="flex flex-col space-y-4 mt-4">
                {menuItems.map((item) => (
                  <div key={item.title}>
                    {item.href ? (
                      <Link href={item.href} onClick={() => setOpen(false)} className="text-sm font-medium">
                        {item.title}
                      </Link>
                    ) : (
                      <>
                        <div className="text-sm font-medium mb-2">{item.title}</div>
                        <div className="pl-4 flex flex-col space-y-3">
                          {item.items?.map((subItem) => (
                            <Link
                              key={subItem.title}
                              href={subItem.href}
                              onClick={() => setOpen(false)}
                              className="text-sm text-muted-foreground hover:text-primary"
                            >
                              {subItem.title}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div className="pt-4 border-t">
                   <NavActions />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>

        {/* 桌面端导航菜单 */}
        <div className="hidden md:flex flex-1 items-center justify-end">
          <nav className="flex items-center">
            <NavigationMenu>
              <NavigationMenuList className="gap-2">
                {menuItems.map((item) => (
                  <NavigationMenuItem key={item.title}>
                    {item.href ? (
                      <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
                        <Link href={item.href}>{item.title}</Link>
                      </NavigationMenuLink>
                    ) : (
                      <>
                        <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                        <NavigationMenuContent className="">
                          <ul className="grid w-[300px] gap-3 p-4">
                            {item.items?.map((subItem) => (
                              <ListItem
                                key={subItem.title}
                                title={subItem.title}
                                href={subItem.href}
                              >
                                {subItem.description}
                              </ListItem>
                            ))}
                          </ul>
                        </NavigationMenuContent>
                      </>
                    )}
                  </NavigationMenuItem>
                ))}
              </NavigationMenuList>
            </NavigationMenu>
            <NavActions />
          </nav>
        </div>
      </div>
    </header>
  )
} 

const ListItem = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  )
})
ListItem.displayName = "ListItem"