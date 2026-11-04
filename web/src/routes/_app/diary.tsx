import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarSearchIcon } from "lucide-react";
import { useState } from "react";
import { DiaryView } from "@/components/diary-view";
import { Page, PageHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTimeZone } from "@/hooks/use-bootstrap";
import { useToday } from "@/hooks/use-now";
import { type LocalDate, WEEK_STARTS_ON, isLocalDate, todayIn } from "@/lib/dates";

export const Route = createFileRoute("/_app/diary")({
  validateSearch: (search: Record<string, unknown>): { day?: LocalDate | undefined } => ({
    day: typeof search.day === "string" && isLocalDate(search.day) ? search.day : undefined,
  }),
  head: () => ({ meta: [{ title: "Diary · Dueboard" }] }),
  component: Diary,
});

const toDate = (date: LocalDate) => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

function Diary() {
  const { user } = Route.useRouteContext();
  const { day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const timeZone = useTimeZone();
  const today = useToday(timeZone) ?? todayIn(timeZone);
  const [open, setOpen] = useState(false);
  const jump = (date: LocalDate | undefined) => void navigate({ search: { day: date }, replace: true });

  return (
    <Page>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-8">
        <PageHeader title="Diary">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline">
                <CalendarSearchIcon />
                Jump to a date
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto! p-0!">
              <Calendar
                mode="single"
                selected={day ? toDate(day) : undefined}
                defaultMonth={toDate(day ?? today)}
                weekStartsOn={WEEK_STARTS_ON}
                disabled={{ after: toDate(today) }}
                today={toDate(today)}
                onSelect={(date) => {
                  if (date) jump(format(date, "yyyy-MM-dd") as LocalDate);
                  setOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </PageHeader>
        <DiaryView username={user.username} self today={today} from={day ?? null} onShowLatest={() => jump(undefined)} />
      </div>
    </Page>
  );
}
