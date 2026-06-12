import { Nav } from '@/components/nav'
import { HomeHero } from './_components/home-hero'
import { HomeServices } from './_components/home-services'
import { HomeWorkflow } from './_components/home-workflow'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <HomeHero />
        <HomeServices />
        <HomeWorkflow />
      </main>
    </>
  )
}
