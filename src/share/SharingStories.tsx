import { useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/dist/csr/ArrowUpRight";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Check } from "@phosphor-icons/react/dist/csr/Check";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NearbyScene } from "./NearbyScene";
import { BrandArtwork, type ArtworkKind } from "./BrandArtwork";
import type { DemoSampleId } from "./HandoffLab";

const stories = [
  {
    id: "notes" as const,
    artwork: "notes" as ArtworkKind,
    label: "After class",
    title: "The good notes.\nBefore everyone leaves.",
    copy: "Pass today’s notes to the person beside you. Bring the study group into a room when there’s more than one person to share with.",
    file: "field-notes.txt",
    detail: "Notes, references, and the next thing to work on.",
    points: ["A quick message for context", "A room for the people you choose"],
    action: "Try passing the notes",
  },
  {
    id: "image" as const,
    artwork: "studio" as ArtworkKind,
    label: "In the studio",
    title: "A fresh idea.\nStraight to the next screen.",
    copy: "Send the concept while the conversation is still happening. Review the selection first, then let the other person choose what to receive.",
    file: "dot-study.svg",
    detail: "The original file, ready for a closer look.",
    points: [
      "Review files before you offer",
      "Receiving starts with their approval",
    ],
    action: "Try a design handoff",
  },
  {
    id: "sheet" as const,
    artwork: "project" as ArtworkKind,
    label: "At the shared desk",
    title: "The next version.\nWithout another upload link.",
    copy: "Trade the plan, the spreadsheet, or a whole project folder. Keep the handoff in one conversation instead of finding another place to upload it.",
    file: "colour-sheet.csv",
    detail: "The small details that keep a project moving.",
    points: [
      "Files and chat in one conversation",
      "Folders arrive as ZIP archives",
    ],
    action: "Try the project file",
  },
];

export function SharingStories({
  onTrySample,
  onOpenApp,
  demoBusy = false,
}: {
  onTrySample: (id: DemoSampleId) => void;
  onOpenApp: () => void;
  demoBusy?: boolean;
}) {
  const [selected, setSelected] = useState<DemoSampleId>("notes");
  const story = stories.find((item) => item.id === selected) ?? stories[0];
  return (
    <section
      className="sharing-stories"
      id="stories"
      aria-labelledby="stories-title"
    >
      <div className="stories-heading" data-reveal>
        <h2 id="stories-title">
          Made for the things
          <br />
          you pass around.
        </h2>
        <p>
          A small handoff can keep a whole day moving.
          <br />
          Pick a moment. See how it works.
        </p>
      </div>
      <Tabs
        value={selected}
        onValueChange={(value) => setSelected(value as DemoSampleId)}
      >
        <TabsList
          className="stories-tabs flex-wrap group-data-horizontal/tabs:h-auto"
          aria-label="Sharing scenarios"
        >
          {stories.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className="h-11 px-5 max-[760px]:flex-[1_1_8rem] max-[760px]:px-3"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={selected} className="story-stage">
          <div className="story-scene">
            <NearbyScene key={selected} filename={story.file} />
          </div>
          <div className="story-copy" key={selected}>
            <div className="story-art-heading">
              <BrandArtwork
                kind={story.artwork}
                className="story-art"
                sizes="(max-width: 760px) 104px, 128px"
              />
              <p className="story-context">An example handoff</p>
            </div>
            <h3>
              {story.title.split("\n").map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h3>
            <p>{story.copy}</p>
            <ul className="story-points">
              {story.points.map((point) => (
                <li key={point}>
                  <Check aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="story-actions">
              <Button
                variant="outline"
                className="h-11"
                disabled={demoBusy}
                aria-describedby={demoBusy ? "stories-demo-busy" : undefined}
                onClick={() => onTrySample(selected)}
              >
                {story.action}
                <ArrowRight />
              </Button>
              <Button variant="ghost" className="h-11" onClick={onOpenApp}>
                Use Bonjou
                <ArrowUpRight />
              </Button>
            </div>
            {demoBusy ? (
              <p
                id="stories-demo-busy"
                className="story-file-note"
                role="status"
              >
                Finish or cancel the demo above before choosing another sample.
              </p>
            ) : null}
            <p className="story-file-note">{story.detail}</p>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
