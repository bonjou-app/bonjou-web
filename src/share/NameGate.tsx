import { useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { WifiHigh as Wifi } from "@phosphor-icons/react/dist/csr/WifiHigh";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";

/**
 * First run. One field, because there is genuinely only one thing to
 * decide: no account is created, nothing is verified, and the name exists
 * so other people can tell which machine is yours.
 */
export function NameGate({ onName }: { onName: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <main className="gate">
      <div className="gate-bar">
        <a href="/" className="gate-home" aria-label="Bonjou home">
          <Logo size={20} />
          <span className="gate-brand">bonjou</span>
        </a>
        <span className="spacer" />
        <span className="gate-status">
          <span className="blip is-idle" aria-hidden="true" />
          Local sharing
        </span>
      </div>

      <Card className="gate-body w-[calc(100%-2rem)] max-w-md self-center justify-self-center my-12 [--card-spacing:--spacing(7)] shadow-sm">
        <CardHeader className="gap-3">
          <div
            className="mb-2 flex size-12 items-center justify-center rounded-xl bg-muted"
            aria-hidden="true"
          >
            <Wifi size={28} weight="regular" />
          </div>
          <CardTitle>
            <h1 className="text-2xl font-semibold tracking-tight">
              First, say hello.
            </h1>
          </CardTitle>
          <CardDescription className="text-[0.9375rem] leading-relaxed">
            Choose a name people nearby will recognize. It&rsquo;s just for
            sharing, with no account to set up.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const name = value.trim();
              if (name) onName(name);
            }}
          >
            <Field>
              <FieldLabel htmlFor="display-name">Your display name</FieldLabel>
              <Input
                id="display-name"
                className="h-11 text-base"
                autoFocus
                value={value}
                maxLength={64}
                onChange={(event) => setValue(event.target.value)}
                placeholder="Your name"
                autoComplete="nickname"
              />
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full mt-1"
                disabled={!value.trim()}
              >
                Start sharing
                <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Field>
          </form>
        </CardContent>
        <CardFooter>
          <FieldDescription className="text-xs leading-relaxed">
            Visible only to directly connected people. You approve every file
            before it downloads.
          </FieldDescription>
        </CardFooter>
      </Card>
    </main>
  );
}
