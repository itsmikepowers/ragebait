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

export function DatePicker({
  date,
  id,
  onChange,
}: {
  date?: Date;
  id?: string;
  onChange: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

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
          {date ? format(date, "PPP") : <span>Pick a date</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[60] w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(next) => {
            onChange(next);
            if (next) {
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
