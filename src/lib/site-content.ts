import { CHURCH } from './church';

export const contentFields = {
  name: ['Identidade', 'Nome da igreja', CHURCH.name],
  tagline: ['Identidade', 'Frase da igreja', 'Uma família para pertencer, crescer e servir.'],
  address: ['Contato', 'Endereço', CHURCH.address],
  city: ['Contato', 'Cidade', CHURCH.city],
  mapsQuery: ['Contato', 'Localização no mapa', CHURCH.mapsQuery],
  phone: ['Contato', 'Telefone', ''],
  email: ['Contato', 'E-mail', ''],
  instagramUrl: ['Contato', 'Link do perfil no Instagram', ''],
  instagramVideo: ['Início', 'Link do vídeo/reel no Instagram', ''],
  heroEyebrow: ['Início', 'Texto acima do título', 'FÉ. VIDA. COMUNIDADE.'],
  heroTitle: ['Início', 'Título principal', 'Comunidade Aava'],
  heroSubtitle: ['Início', 'Destaque principal', 'Você faz parte.'],
  heroText: ['Início', 'Texto principal', 'Somos uma família de fé em Jacareí. Um lugar para encontrar esperança, caminhar junto e viver o amor de Deus.'],
  heroPrimary: ['Início', 'Botão de cultos', 'Venha nos conhecer'],
  heroSecondary: ['Início', 'Botão de oração', 'Peça uma oração'],
  videoLabel: ['Início', 'Título do vídeo', 'Nossa comunidade, de perto.'],
  videoCta: ['Início', 'Botão do Instagram', 'Acompanhe no Instagram'],
  valuesEyebrow: ['Início', 'Introdução dos valores', 'NOSSA ESSÊNCIA'],
  valuesTitle: ['Início', 'Título dos valores', 'Uma fé que se vive junto.'],
  welcomeTitle: ['Início', 'Valor 1 — título', 'Acolhimento'],
  welcomeText: ['Início', 'Valor 1 — texto', 'Cada pessoa é recebida com cuidado e amor.'],
  wordTitle: ['Início', 'Valor 2 — título', 'Palavra'],
  wordText: ['Início', 'Valor 2 — texto', 'Ensino bíblico simples, profundo e prático.'],
  communityTitle: ['Início', 'Valor 3 — título', 'Comunidade'],
  communityText: ['Início', 'Valor 3 — texto', 'Grupos e ministérios para caminhar junto.'],
  galleryTitle: ['Início', 'Título das fotos', 'Momentos que nos unem.'],
  gatheringTitle: ['Início', 'Chamada dos cultos', 'Domingos às 18h'],
  gatheringText: ['Início', 'Texto dos cultos', 'Culto de celebração — venha como está.'],
  gatheringCta: ['Início', 'Botão de horários', 'Ver todos os horários'],
  aboutEyebrow: ['Quem somos', 'Texto acima do título', 'Quem somos'],
  aboutTitle: ['Quem somos', 'Título', 'Uma família que caminha junto'],
  aboutText: ['Quem somos', 'Apresentação', 'Somos uma comunidade cristã em Jacareí que deseja viver e compartilhar o amor de Deus de forma simples e verdadeira.'],
  missionTitle: ['Quem somos', 'Missão — título', 'Missão'],
  missionText: ['Quem somos', 'Missão — texto', 'Fazer discípulos que amam a Deus, amam pessoas e servem à cidade.'],
  visionTitle: ['Quem somos', 'Visão — título', 'Visão'],
  visionText: ['Quem somos', 'Visão — texto', 'Ser uma igreja acolhedora, relevante e presente na vida de cada família.'],
  beliefsTitle: ['Quem somos', 'Valores — título', 'Valores'],
  beliefsText: ['Quem somos', 'Valores — texto', 'Graça, verdade, comunhão, generosidade e serviço.'],
  servicesEyebrow: ['Cultos', 'Texto acima do título', 'Cultos'],
  servicesTitle: ['Cultos', 'Título', 'Venha celebrar conosco'],
  servicesText: ['Cultos', 'Descrição', ''],
  contactEyebrow: ['Contato', 'Texto acima do título', 'Contato'],
  contactTitle: ['Contato', 'Título', 'Estamos esperando por você'],
  contactText: ['Contato', 'Descrição', ''],
  addressLabel: ['Contato', 'Título do endereço', 'Endereço'],
  mapsLabel: ['Contato', 'Botão do mapa', 'Abrir no Google Maps'],
  socialLabel: ['Contato', 'Título das redes sociais', 'Redes sociais'],
  contributionEyebrow: ['Contribuição', 'Texto acima do título', 'GENEROSIDADE'],
  contributionTitle: ['Contribuição', 'Título', 'Contribuição'],
  contributionText: ['Contribuição', 'Apresentação', 'Sua generosidade faz parte da nossa caminhada.'],
  pixTitle: ['Contribuição', 'Título do Pix', 'Contribua via Pix'],
  methodsTitle: ['Contribuição', 'Título dos métodos', 'Outras formas de contribuir'],
  contributionEmpty: ['Contribuição', 'Texto sem métodos cadastrados', 'Entre em contato com a igreja para informações sobre contribuições.'],
  prayerEyebrow: ['Oração', 'Texto acima do título', 'CUIDADO E FÉ'],
  prayerTitle: ['Oração', 'Título', 'Pedidos de oração'],
  prayerText: ['Oração', 'Apresentação', 'Não caminhe sozinho. Queremos orar com você.'],
  prayerCta: ['Oração', 'Botão de pedido', 'Enviar meu pedido'],
  prayerPrivacy: ['Oração', 'Texto de privacidade', 'Seu pedido será visto somente por você e pela liderança da igreja.'],
  navHome: ['Navegação', 'Início', 'Início'],
  navAbout: ['Navegação', 'Quem somos', 'Quem somos'],
  navServices: ['Navegação', 'Cultos', 'Cultos'],
  navPrayer: ['Navegação', 'Oração', 'Oração'],
  navContribution: ['Navegação', 'Contribuição', 'Contribuição'],
  navContact: ['Navegação', 'Contato', 'Contato'],
  navPanel: ['Navegação', 'Área de membros', 'Área de membros'],
} as const;
export type ContentKey = keyof typeof contentFields;
export type SiteContent = Record<ContentKey, string> & {
  photos: { url: string; caption: string }[];
  schedule: { day: string; time: string; name: string }[];
  pixKeys: { label: string; key: string; recipient: string }[];
  methods: { title: string; details: string; url: string }[];
};
export const defaultContent: SiteContent = {
  ...Object.fromEntries(Object.entries(contentFields).map(([key, value]) => [key, value[2]])) as Record<ContentKey, string>,
  photos: [],
  schedule: [
    { day: 'Domingo', time: '18h00', name: 'Culto de Celebração' },
    { day: 'Quarta-feira', time: '20h00', name: 'Culto de Oração e Palavra' },
    { day: 'Sábado', time: '19h30', name: 'Encontro de Jovens' },
  ],
  pixKeys: [], methods: [],
};
export function mergeContent(content: unknown): SiteContent {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return defaultContent;
  return { ...defaultContent, ...content } as SiteContent;
}
export function safeLink(url: string) {
  try { const u = new URL(url); return u.protocol === 'https:' ? u.href : undefined; } catch { return undefined; }
}