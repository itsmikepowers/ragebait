"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Date picker with an optional time field rendered inside the same popover.
 * Pass `withTime` to enable it; `date` then carries both the day and the
 * time-of-day, and the trigger label shows them together.
 */
export function DatePicker({
  date,
  id,
  onChange,
  withTime = false,
}: {
  date?: Date;
  id?: string;
  onChange: (date: Date | undefined) => void;
  withTime?: boolean;
}) {
  const [open, setOpen] = useState(false);

  function timeValue(): string {
    if (!date) {
      return "12:00";
    }
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function withTimeApplied(next: Date, time: string): Date {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    const result = new Date(next);
    if (match) {
      result.setHours(Number(match[1]), Number(match[2]), 0, 0);
    }
    return result;
  }

  return (
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          data-empty={!date}
          className={cn(
            "h-11 w-full justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
          )}
        >
          <CalendarIcon />
          {date ? (
            format(date, withTime ? "PPP 'at' h:mm a" : "PPP")
          ) : (
            <span>{withTime ? "Pick a date & time" : "Pick a date"}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(next) => {
            if (!next) {
              onChange(undefined);
              return;
            }
            onChange(withTime ? withTimeApplied(next, timeValue()) : next);
            if (!withTime) {
              setOpen(false);
            }
          }}
        />
        {withTime ? (
          <div className="flex items-center justify-between gap-3 border-t p-3">
            <label
              htmlFor={id ? `${id}-time` : undefined}
              className="text-sm text-muted-foreground"
            >
              Time
            </label>
            <input
              id={id ? `${id}-time` : undefined}
              type="time"
              value={timeValue()}
              onChange={(event) => {
                const base = date ?? new Date();
                onChange(withTimeApplied(base, event.target.value));
              }}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
