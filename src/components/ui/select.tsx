import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);
const SelectItemRegistryContext = React.createContext<Map<string, string> | null>(null);

function useSelectContext() {
  const value = React.useContext(SelectContext);
  if (!value) {
    throw new Error("Select components must be used within <Select>");
  }
  return value;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}

function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const itemLabels = React.useMemo(() => new Map<string, string>(), []);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <SelectItemRegistryContext.Provider value={itemLabels}>{children}</SelectItemRegistryContext.Provider>
    </SelectContext.Provider>
  );
}

const SelectTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen } = useSelectContext();

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        onClick={() => setOpen(!open)}
        {...props}
      >
        <span className="truncate">{children}</span>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </button>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useSelectContext();
  const labels = React.useContext(SelectItemRegistryContext);
  const label = value && labels ? labels.get(value) : undefined;
  return <>{label ?? placeholder ?? "Select"}</>;
}

const SelectContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const { open } = useSelectContext();

    if (!open) {
      return null;
    }

    return (
      <div
        ref={ref}
        className={cn("relative z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md", className)}
        {...props}
      />
    );
  },
);
SelectContent.displayName = "SelectContent";

interface SelectItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

const SelectItem = React.forwardRef<HTMLButtonElement, SelectItemProps>(
  ({ className, value, children, onClick, ...props }, ref) => {
    const { value: currentValue, onValueChange, setOpen } = useSelectContext();
    const labels = React.useContext(SelectItemRegistryContext);

    React.useEffect(() => {
      if (!labels) {
        return;
      }
      labels.set(value, String(children));
      return () => {
        labels.delete(value);
      };
    }, [children, labels, value]);

    return (
      <button
        ref={ref}
        type="button"
        role="option"
        aria-selected={currentValue === value}
        className={cn(
          "relative flex w-full cursor-pointer items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none",
          "hover:bg-accent hover:text-accent-foreground",
          className,
        )}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) {
            onValueChange?.(value);
            setOpen(false);
          }
        }}
        {...props}
      >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          {currentValue === value ? <Check className="h-4 w-4" /> : null}
        </span>
        <span className="truncate">{children}</span>
      </button>
    );
  },
);
SelectItem.displayName = "SelectItem";

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
