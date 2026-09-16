import { getEnvironmentLabel } from "@/lib/environment";

export default function Home() {
  const environment = getEnvironmentLabel(process.env.VERCEL_ENV, process.env.NODE_ENV);

  return (
    <main>
      <h1>Chess Opponent Browser</h1>
      <p>Application skeleton is running.</p>
      <p>Environment: {environment}</p>
    </main>
  );
}
