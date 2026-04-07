export type ReadmeSection = {
  id: string;
  /** Full line of the heading, e.g. ## API */
  headingLine: string;
  /** Visible title without # marks */
  title: string;
  level: number;
  /** Heading + body until next same-or-higher-level heading */
  markdown: string;
};

const HEADER = /^(#{1,6})\s+(.+?)\s*$/;

export function splitReadmeIntoSections(markdown: string): ReadmeSection[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: ReadmeSection[] = [];
  let intro: string[] = [];
  let current: {
    headingLine: string;
    title: string;
    level: number;
    body: string[];
  } | null = null;

  const flushIntro = () => {
    if (intro.length === 0) return;
    const text = intro.join("\n").trimEnd();
    if (text.length > 0) {
      sections.push({
        id: "section-intro",
        headingLine: "",
        title: "Introduction",
        level: 0,
        markdown: text,
      });
    }
    intro = [];
  };

  const flushCurrent = () => {
    if (!current) return;
    const md = [current.headingLine, ...current.body].join("\n").trimEnd();
    sections.push({
      id: `section-${sections.length}`,
      headingLine: current.headingLine,
      title: current.title,
      level: current.level,
      markdown: md,
    });
    current = null;
  };

  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      if (!current) {
        flushIntro();
        current = {
          headingLine: line,
          title,
          level,
          body: [],
        };
      } else if (level <= current.level) {
        flushCurrent();
        current = {
          headingLine: line,
          title,
          level,
          body: [],
        };
      } else {
        current.body.push(line);
      }
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }

  flushIntro();
  flushCurrent();

  // Re-assign stable ids by index
  return sections.map((s, i) => ({
    ...s,
    id: `section-${i}`,
  }));
}

export function replaceSectionMarkdown(
  fullReadme: string,
  section: ReadmeSection,
  newSectionMarkdown: string
): string {
  const sections = splitReadmeIntoSections(fullReadme);
  const idx = sections.findIndex((s) => s.id === section.id);
  if (idx === -1) return fullReadme;
  const before = sections.slice(0, idx).map((s) => s.markdown);
  const after = sections.slice(idx + 1).map((s) => s.markdown);
  const parts = [...before, newSectionMarkdown, ...after].filter(Boolean);
  return parts.join("\n\n");
}
