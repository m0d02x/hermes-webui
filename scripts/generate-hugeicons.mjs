import { writeFile } from 'node:fs/promises';
import {
  Chatting01Icon, Calendar03Icon, KanbanIcon, Layers01Icon, AiBrain01Icon,
  Folder01Icon, LibraryIcon, UserMultiple02Icon, Task01Icon, Analytics01Icon,
  DashboardSquare01Icon, File02Icon, Setting07Icon, Sun01Icon, SlidersHorizontalIcon,
  Key01Icon, PuzzleIcon, Plug01Icon, CpuIcon, HelpCircleIcon, Cancel01Icon,
} from '@hugeicons/core-free-icons';

const icons = {
  chat: Chatting01Icon,
  tasks: Calendar03Icon,
  kanban: KanbanIcon,
  skills: Layers01Icon,
  memory: AiBrain01Icon,
  workspaces: Folder01Icon,
  library: LibraryIcon,
  profiles: UserMultiple02Icon,
  todos: Task01Icon,
  insights: Analytics01Icon,
  dashboard: DashboardSquare01Icon,
  logs: File02Icon,
  settings: Setting07Icon,
  conversation: Chatting01Icon,
  appearance: Sun01Icon,
  preferences: SlidersHorizontalIcon,
  providers: Key01Icon,
  plugins: PuzzleIcon,
  extensions: Plug01Icon,
  system: CpuIcon,
  help: HelpCircleIcon,
  folder: Folder01Icon,
  close: Cancel01Icon,
};

function escapeAttribute(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function toSvgMarkup(icon) {
  return icon.map(([tag, attributes]) => {
    const attrs = Object.entries(attributes)
      .filter(([key]) => key !== 'key')
      .map(([key, value]) => ` ${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escapeAttribute(value)}"`)
      .join('');
    return `<${tag}${attrs}></${tag}>`;
  }).join('');
}

const entries = Object.entries(icons).map(([name, data]) => `  ${JSON.stringify(name)}: ${JSON.stringify(toSvgMarkup(data))}`).join(',\n');
const output = `// Generated from @hugeicons/core-free-icons by scripts/generate-hugeicons.mjs. Do not edit.\nwindow.HUGEICONS = Object.freeze({\n${entries}\n});\n`;
await writeFile(new URL('../static/hugeicons.js', import.meta.url), output);
