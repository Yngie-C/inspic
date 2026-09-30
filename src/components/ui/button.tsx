import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

// DESIGN.md Components > 버튼. hover에서는 색만 바뀐다(이동·그림자 없음).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition-colors duration-150 ease-out disabled:pointer-events-none disabled:border-line disabled:bg-surface disabled:text-faint",
  {
    variants: {
      variant: {
        // primary: accent 면. 한 화면(또는 한 블록)에 하나만 둔다.
        default:
          "border-transparent bg-accent text-on-accent hover:bg-accent-hover",
        secondary:
          "border-line bg-surface text-primary hover:border-primary",
        outline:
          "border-line bg-surface text-primary hover:border-primary",
        ghost:
          "border-transparent text-primary hover:bg-mark",
        destructive:
          "border-danger/50 bg-surface text-danger hover:border-danger",
        link: "border-transparent text-primary underline decoration-1 underline-offset-3",
      },
      size: {
        sm: "h-8 px-3 text-caption",
        md: "h-9 px-4 text-button",
        lg: "h-11 px-5 text-button",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  asChild?: boolean;
}

function Button({
  className,
  variant,
  size,
  isLoading,
  asChild = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
