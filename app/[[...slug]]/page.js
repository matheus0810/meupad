import Pad from "../Pad";
import { normalizeName } from "../lib";

export default async function Page({ params }) {
  const { slug } = await params;
  const name = normalizeName((slug || []).map(decodeURIComponent).join("/")) || "inicio";
  return <Pad name={name} />;
}
