import { useXRApp } from './store'
import type { Lang } from './i18n'

/**
 * Guided tour for first-time visitors (e.g. judges): a short narrated-by-caption journey from the Solar
 * System to Mars orbit, down to Victoria Crater, over to the Opportunity rover, to Gale Crater facing Mount
 * Sharp, and finally Jezero, where Perseverance landed. Each stop moves you there and shows a caption.
 */
export interface TourStop {
  id: string
  title: Record<Lang, string>
  caption: Record<Lang, string>
  /** seconds to read before moving on automatically (counted once the place has loaded) */
  seconds: number
  go: () => void
}

const app = () => useXRApp.getState()

export const TOUR: TourStop[] = [
  {
    id: 'solar-system',
    title: { en: 'The Solar System', id: 'Tata Surya' },
    caption: {
      en: 'Welcome, explorer! These are the planets of our Solar System. Sizes and distances are squeezed so everything fits around you. Our journey goes to Mars.',
      id: 'Selamat datang, penjelajah! Inilah planet-planet Tata Surya kita. Ukuran dan jaraknya diperkecil agar semua muat di sekitarmu. Perjalanan kita menuju Mars.',
    },
    seconds: 13,
    go: () => app().selectBody(null),
  },
  {
    id: 'mars-orbit',
    title: { en: 'Mars from orbit', id: 'Mars dari orbit' },
    caption: {
      en: 'This is Mars, coloured from Viking orbiter images and shaded with real elevation data from the MOLA laser altimeter. Glowing pins mark places to learn about, like Olympus Mons, the tallest volcano in the Solar System.',
      id: 'Inilah Mars, diwarnai dari citra pengorbit Viking dan diberi bayangan dari data ketinggian asli altimeter laser MOLA. Pin bercahaya menandai tempat menarik, seperti Olympus Mons, gunung berapi tertinggi di Tata Surya.',
    },
    seconds: 15,
    go: () => {
      app().selectBody('mars')
      app().selectHotspot('olympus-mons')
    },
  },
  {
    id: 'victoria',
    title: { en: 'Landing at Victoria Crater', id: 'Mendarat di Kawah Victoria' },
    caption: {
      en: 'Touchdown! You are standing on the rim of Victoria Crater on Meridiani Planum. The crater is about 800 m wide, and its shape comes from a NASA elevation model. Mars pulls you down with only 38% of Earth’s gravity.',
      id: 'Mendarat! Kamu berdiri di bibir Kawah Victoria di Meridiani Planum. Lebar kawah ini sekitar 800 m, dan bentuknya berasal dari model ketinggian NASA. Gravitasi Mars hanya 38% gravitasi Bumi.',
    },
    seconds: 15,
    go: () => app().selectSite('victoria', 'mars'),
  },
  {
    id: 'opportunity',
    title: { en: 'Meet Opportunity', id: 'Bertemu Opportunity' },
    caption: {
      en: 'This is the Opportunity rover, about the size of a golf cart. It reached Victoria in 2006 and spent about two years here. Planned for 90 days, it worked for nearly 15 years and drove more than 45 km.',
      id: 'Inilah rover Opportunity, kira-kira seukuran mobil golf. Rover ini tiba di Victoria pada 2006 dan tinggal sekitar dua tahun. Direncanakan bekerja 90 hari, ternyata bertahan hampir 15 tahun dan menempuh lebih dari 45 km.',
    },
    seconds: 15,
    go: () => {
      if (app().siteId !== 'victoria') app().selectSite('victoria', 'mars')
      app().requestGoTo({ x: -273, z: -280 })
      app().selectHotspot('opportunity-rover')
    },
  },
  {
    id: 'gale',
    title: { en: 'Gale Crater and Mount Sharp', id: 'Kawah Gale dan Gunung Sharp' },
    caption: {
      en: 'Now you are on the floor of Gale Crater, where Curiosity landed in 2012. Ahead rises Mount Sharp, a 5 km tall stack of rock layers. Curiosity climbs it to read Mars’ history, from wetter times to drier ones.',
      id: 'Kini kamu berada di dasar Kawah Gale, tempat Curiosity mendarat pada 2012. Di depan menjulang Gunung Sharp, tumpukan lapisan batuan setinggi 5 km. Curiosity mendakinya untuk membaca sejarah Mars, dari masa basah ke masa kering.',
    },
    seconds: 16,
    go: () => {
      app().selectSite('gale', 'mars')
      app().selectHotspot('mount-sharp')
    },
  },
  {
    id: 'jezero',
    title: { en: 'Jezero Crater', id: 'Kawah Jezero' },
    caption: {
      en: 'Last stop: Jezero Crater, an ancient lake. Perseverance landed right here in 2021 with the Ingenuity helicopter, the first aircraft to fly on another planet. Perseverance is collecting rocks that may hold signs of ancient life.',
      id: 'Pemberhentian terakhir: Kawah Jezero, bekas danau purba. Perseverance mendarat tepat di sini pada 2021 bersama helikopter Ingenuity, pesawat pertama yang terbang di planet lain. Perseverance mengumpulkan batuan yang mungkin menyimpan tanda kehidupan purba.',
    },
    seconds: 16,
    go: () => {
      app().selectSite('jezero', 'mars')
      app().selectHotspot('jezero-landing')
    },
  },
]

export const TOUR_END = {
  title: { en: 'Tour complete!', id: 'Tur selesai!' },
  caption: {
    en: 'Now explore on your own: grab and throw rocks, try the missions in your menu, or travel to the Moon and asteroid Bennu.',
    id: 'Sekarang jelajahi sendiri: ambil dan lempar batu, coba misi di menumu, atau pergi ke Bulan dan asteroid Bennu.',
  },
}
