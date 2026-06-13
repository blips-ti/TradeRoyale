import { Nav } from "./_components/Nav";
import { Hero } from "./_components/Hero";
import { Ticker } from "./_components/Ticker";
import { HowItWorks } from "./_components/HowItWorks";
import { Pillars } from "./_components/Pillars";
import { Stack } from "./_components/Stack";
import { FeaturedCTA } from "./_components/FeaturedCTA";
import { Footer } from "./_components/Footer";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <Hero />
      <Ticker />
      <HowItWorks />
      <Pillars />
      <Stack />
      <FeaturedCTA />
      <Footer />
    </>
  );
}
