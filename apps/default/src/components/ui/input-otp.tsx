import * as React from "react"
import { MinusIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// Minimal shim — the `input-otp` npm package is not installed.
// We provide a lightweight replacement so the module graph doesn't crash.

type OTPInputContextType = {
  slots: Array<{ char: string | null; hasFakeCaret: boolean; isActive: boolean }>;
};
const OTPInputContext = React.createContext<OTPInputContextType>({ slots: [] });

function InputOTP({
  className,
  containerClassName,
  maxLength = 6,
  value = '',
  onChange,
  ...props
}: React.ComponentProps<"input"> & {
  containerClassName?: string;
  maxLength?: number;
}) {
  return (
    <div
      data-slot="input-otp"
      className={cn("flex items-center gap-2", containerClassName)}
    >
      <input
        type="text"
        inputMode="numeric"
        maxLength={maxLength}
        value={value}
        onChange={onChange}
        className={cn("sr-only", className)}
        {...props}
      />
    </div>
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="input-otp-separator" role="separator" {...props}>
      <MinusIcon />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
