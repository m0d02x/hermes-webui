import { createRoot } from "react-dom/client";
import { Library } from "./Library";
import "./library.css";

const mount = document.getElementById("mainLibrary");
if (!mount) throw new Error("Missing #mainLibrary Library mount");

const root = createRoot(mount);
root.render(<Library />);

window.HermesLibrary = {
  refresh() {
    window.dispatchEvent(new Event("hermes-library-refresh"));
  },
};
