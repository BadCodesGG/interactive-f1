import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]",
        destructive:
          "bg-[var(--error)] text-white shadow-sm hover:bg-[var(--error)]/90",
        outline:
          "border border-[var(--field-border)] bg-transparent shadow-sm hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
        secondary:
          "bg-[var(--surface)] text-[var(--ink)] shadow-sm hover:bg-[var(--surface-hover)]",
        ghost:
          "hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
        link: "text-[var(--accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs max-md:min-h-9",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9 max-md:min-h-9 max-md:min-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
