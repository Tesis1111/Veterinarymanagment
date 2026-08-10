"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "./utils";
import { buttonVariants } from "./button";

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={1}
      className={cn("p-4 bg-white rounded-2xl shadow-sm border border-gray-100", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4 w-full",
        caption: "flex justify-center pt-2 relative items-center",
        caption_label: "flex items-center text-base font-bold text-gray-800 capitalize",
        // Selectores de mes/año (captionLayout="dropdown-buttons").
        // react-day-picker dibuja, dentro de cada dropdown, un <select> real y
        // un div decorativo con el texto. Se replica su técnica: el <select>
        // va superpuesto y transparente, y el texto visible es el div.
        caption_dropdowns: "flex items-center justify-center gap-2",
        dropdown_month:
          "relative inline-flex items-center rounded-md border border-gray-200 px-2 py-1 hover:border-orange-300 focus-within:ring-2 focus-within:ring-orange-500",
        dropdown_year:
          "relative inline-flex items-center rounded-md border border-gray-200 px-2 py-1 hover:border-orange-300 focus-within:ring-2 focus-within:ring-orange-500",
        dropdown:
          "absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none border-0 bg-transparent opacity-0",
        dropdown_icon: "ml-1 h-4 w-4 text-gray-500",
        vhidden: "sr-only",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 bg-transparent p-0 text-gray-600 hover:bg-gray-100 transition-colors border-none"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "grid grid-cols-7 gap-1 w-full mb-2",
        head_cell:
          "text-orange-900/60 uppercase font-bold text-[0.7rem] tracking-wider flex items-center justify-center",
        row: "grid grid-cols-7 gap-1 w-full mt-1",
        cell: "flex items-center justify-center text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 p-0 font-medium text-gray-700 aria-selected:opacity-100 rounded-full transition-all duration-200 hover:bg-orange-100 hover:text-orange-900 hover:scale-110"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-orange-600 text-white hover:bg-orange-700 hover:text-white focus:bg-orange-700 focus:text-white shadow-md shadow-orange-200 font-bold scale-105",
        day_today: "bg-orange-50 text-orange-900 font-bold ring-1 ring-inset ring-orange-200",
        day_outside:
          "day-outside text-gray-400 opacity-50 aria-selected:bg-orange-50 aria-selected:text-gray-500 aria-selected:opacity-30",
        day_disabled: "text-gray-300 opacity-50",
        day_range_middle:
          "aria-selected:bg-orange-50 aria-selected:text-orange-900",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-5 w-5" />,
        IconRight: () => <ChevronRight className="h-5 w-5" />,
      }}
      {...props}
    />
  );
}

export { Calendar };