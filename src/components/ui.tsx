"use client";

import { LoaderCircle, X } from "lucide-react";
import {
  forwardRef,
  Children,
  cloneElement,
  isValidElement,
  useState,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormGuard } from "./form-guard";
import { ApiError, apiErrorFields } from "@/lib/api/client";

export function Button({
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <button className={`button button-${variant} ${className}`} {...props} />
  );
}
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input(props, ref) {
  return <input ref={ref} className="input" {...props} />;
});
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(function Checkbox(props, ref) {
  return <input ref={ref} type="checkbox" className="checkbox" {...props} />;
});
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input" {...props} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input min-h-24 resize-y" {...props} />;
}
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const id = useId();
  const describe = `${id}-description`;
  const controls = associateControls(children, id, describe, error, hint);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {controls}
      {error ? (
        <small id={describe} className="field-error" role="alert">
          {error}
        </small>
      ) : hint ? (
        <small id={describe}>{hint}</small>
      ) : null}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <LoaderCircle className="animate-spin" size={22} />
      {label}…
    </div>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">ER</div>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message ??
    (error instanceof Error ? error.message : "Something went wrong.");
  const fields = apiError ? apiErrorFields(apiError) : [];
  return (
    <div className="error-panel" role="alert">
      <strong>{message}</strong>
      {fields.length > 0 && (
        <ul>
          {fields.map((detail, index) => (
            <li key={`${detail.field}-${index}`}>
              {detail.field.replace(/([a-z])([A-Z])/g, "$1 $2")}:{" "}
              {detail.message}
            </li>
          ))}
        </ul>
      )}
      {apiError?.requestId && (
        <span>
          Request ID: <code>{apiError.requestId}</code>
        </span>
      )}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Modal({
  title,
  className = "",
  eyebrow = "Core record",
  headerActions,
  closeDisabled = false,
  protectChanges = true,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  className?: string;
  eyebrow?: string;
  headerActions?: ReactNode;
  closeDisabled?: boolean;
  protectChanges?: boolean;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const [dirty, setDirty] = useState(false);
  const clearGuard = useFormGuard(protectChanges && dirty, closeDisabled);
  const close = useRef(onClose);
  function requestClose() {
    if (closeDisabled) return;
    if (
      protectChanges &&
      dirty &&
      !window.confirm("Discard your unsaved changes?")
    )
      return;
    clearGuard();
    onClose();
  }
  useEffect(() => {
    close.current = requestClose;
  });
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = panel.current;
    const focusable = () =>
      Array.from(
        element?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) ?? [],
      );
    (focusable()[0] ?? element)?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first) {
          event.preventDefault();
          element?.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            !element?.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !element?.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    element?.addEventListener("keydown", keydown);
    const observer = new MutationObserver(() => {
      if (!element?.contains(document.activeElement))
        (focusable()[0] ?? element)?.focus();
    });
    if (element) observer.observe(element, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      element?.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onChangeCapture={() => setDirty(true)}
        onClickCapture={(event) => {
          const button = (event.target as Element).closest("button");
          if (
            button?.type === "button" &&
            /^(Cancel|Keep unchanged|Close)$/.test(
              button.textContent?.trim() ?? "",
            )
          ) {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
          }
        }}
      >
        <header>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={requestClose}
            aria-label="Close dialog"
            disabled={closeDisabled}
          >
            <X />
          </button>
          {headerActions && (
            <div className="modal-header-actions">{headerActions}</div>
          )}
        </header>
        {protectChanges ? (
          <fieldset
            className="modal-content"
            disabled={closeDisabled}
            aria-label={title}
          >
            {children}
          </fieldset>
        ) : (
          children
        )}
      </section>
    </div>
  );
}
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination">
      <span>
        Showing {total ? (page - 1) * pageSize + 1 : 0}–
        {Math.min(page * pageSize, total)} of {total}
      </span>
      <div>
        <Button
          variant="ghost"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} of {pages}
        </span>
        <Button
          variant="ghost"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="success-panel" role="status">
      {children}
    </div>
  );
}

function associateControls(
  children: ReactNode,
  id: string,
  describe: string,
  error?: string,
  hint?: string,
) {
  let labelled = false;
  function visit(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return child;
      const props = child.props;
      const control =
        child.type === Input ||
        child.type === Select ||
        child.type === Textarea ||
        child.type === Checkbox;
      if (control && !labelled) {
        labelled = true;
        return cloneElement(child, {
          id,
          "aria-invalid": error ? true : props["aria-invalid"],
          "aria-describedby":
            [props["aria-describedby"], error || hint ? describe : null]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      }
      if (props.children)
        return cloneElement(child, {}, visit(props.children as ReactNode));
      if (typeof child.type === "function" && !labelled) {
        labelled = true;
        return cloneElement(child, {
          id,
          "aria-invalid": Boolean(error) || undefined,
          "aria-describedby": error || hint ? describe : undefined,
        });
      }
      return child;
    });
  }
  return visit(children);
}
