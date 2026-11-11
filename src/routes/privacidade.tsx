import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteLayout, PageHeader } from "@/components/site/SiteLayout";
import { PageError } from "@/components/site/PageError";
import { siteQuery, siteMeta, useSiteContent } from "@/lib/site-query";
import { safeLink } from "@/lib/site-content";
import { PRIVACY_UPDATED_LABEL } from "@/lib/privacy";

export const Route = createFileRoute("/privacidade")({
  loader: ({ context }) => context.queryClient.ensureQueryData(siteQuery),
  head: ({ loaderData: c }) =>
    siteMeta(
      `Política de Privacidade — ${c?.name ?? "Comunidade Aava"}`,
      "Como tratamos seus dados pessoais: o que coletamos, para quê, por quanto tempo e como exercer seus direitos.",
    ),
  errorComponent: PageError,
  notFoundComponent: PageError,
  component: PrivacyPolicy,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl text-foreground">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function PrivacyPolicy() {
  const c = useSiteContent();
  const whatsapp = safeLink(c.whatsappUrl) ? c.whatsappUrl : "";

  return (
    <SiteLayout>
      <PageHeader
        eyebrow="Privacidade"
        title="Política de Privacidade"
        text="Explicamos, em linguagem simples, como cuidamos dos seus dados pessoais."
      />
      <article className="mx-auto max-w-3xl space-y-10 px-5 py-16 lg:px-10">
        <p className="text-sm text-muted-foreground">Última atualização: {PRIVACY_UPDATED_LABEL}</p>

        <Section title="Quem é responsável pelos seus dados">
          <p>
            A <strong className="text-foreground">{c.name}</strong> ({c.address}, {c.city}) é a
            responsável pelos dados pessoais tratados neste site e na área de membros. Seguimos a
            Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
          </p>
        </Section>

        <Section title="Quais dados coletamos e para quê">
          <Bullets
            items={[
              <>
                <strong className="text-foreground">Sua conta:</strong> nome, e-mail e senha. A
                senha é guardada de forma protegida e nós não conseguimos lê-la. Serve para você
                entrar na área de membros e se inscrever em eventos.
              </>,
              <>
                <strong className="text-foreground">Cadastro de membro:</strong> nome, telefone,
                e-mail, CPF, RG, data de nascimento, endereço, estado civil, dados de batismo e de
                filiação, foto e anotações da liderança. Serve para manter o cadastro da comunidade,
                entrar em contato e acompanhar a vida da igreja.
              </>,
              <>
                <strong className="text-foreground">Inscrição em eventos:</strong> nome, CPF,
                telefone, data de nascimento e, quando o evento pedir, autorização de uso de imagem
                e comprovante de pagamento. Visitantes também informam a instituição que frequentam
                e a religião. Serve para controlar vagas, confirmar pagamentos, fazer a entrada com
                QR code e conhecer o perfil do público (por exemplo, quantos participantes por
                religião, instituição e faixa etária).
              </>,
              <>
                <strong className="text-foreground">Contribuições (dízimos e ofertas):</strong>{" "}
                valor, data, forma de pagamento e, quando houver, a pessoa que contribuiu. Serve
                para o controle e a prestação de contas financeiras. Só a liderança (CEO e Pastor
                Presidente) e quem recebeu permissão para o financeiro conseguem ver.
              </>,
              <>
                <strong className="text-foreground">Pedidos de oração:</strong> assunto e mensagem,
                ligados à sua conta. Servem para que a equipe autorizada ore e acompanhe o pedido.
              </>,
              <>
                <strong className="text-foreground">Escalas de voluntários:</strong> sua
                participação nas escalas dos departamentos.
              </>,
              <>
                <strong className="text-foreground">Avisos no celular:</strong> um identificador do
                seu navegador ou aparelho, somente se você ativar as notificações.
              </>,
              <>
                <strong className="text-foreground">Registro de atividades:</strong> o nome de quem
                fez alterações importantes no painel, com data e hora. Ele não guarda o conteúdo dos
                campos alterados. Serve para segurança e prestação de contas.
              </>,
            ]}
          />
        </Section>

        <Section title="Dados sensíveis">
          <p>
            Religião e a participação em uma igreja são dados pessoais sensíveis pela LGPD. Isso
            vale, por exemplo, para o seu cadastro como membro da {c.name} e para a religião
            informada por visitantes em inscrições de eventos. Por isso esses dados só são tratados
            com o seu consentimento e ficam disponíveis apenas para as pessoas que a igreja
            autoriza. Você pode retirar o consentimento quando quiser (veja “Seus direitos”).
          </p>
        </Section>

        <Section title="Com quem compartilhamos">
          <Bullets
            items={[
              "Dentro da igreja, somente com pessoas autorizadas (liderança, administração, tesouraria e líderes de departamento). Cada função enxerga apenas o que precisa para o seu trabalho.",
              "Não vendemos seus dados nem os cedemos a terceiros para publicidade.",
              "Com empresas de tecnologia que fazem o sistema funcionar (hospedagem, banco de dados, autenticação e envio de e-mails e notificações). Elas tratam os dados em nosso nome e podem usar servidores fora do Brasil.",
              "Com serviços incorporados ao site: fontes do Google (todas as páginas), mapa do Google (páginas Início e Contato) e vídeo do Instagram (página Início, quando configurado). Ao carregar esses itens, eles podem receber seu endereço de IP e dados do seu navegador, conforme as próprias políticas deles.",
              "Com autoridades, quando a lei exigir.",
            ]}
          />
        </Section>

        <Section title="Cookies e armazenamento no navegador">
          <p>
            Usamos apenas o armazenamento do navegador que é necessário para manter você conectado e
            lembrar de preferências do aplicativo. Não usamos cookies de publicidade nem ferramentas
            de análise de audiência.
          </p>
        </Section>

        <Section title="Por quanto tempo guardamos">
          <p>
            Guardamos seus dados enquanto você mantiver vínculo com a comunidade ou enquanto forem
            necessários para as finalidades acima. Quando um cadastro ou outro item é excluído pela
            equipe, ele fica numa lixeira interna, visível só para a liderança, por até 30 dias (para
            desfazer exclusões feitas por engano) e depois é apagado do sistema de forma definitiva.
            Se você pedir a exclusão da sua conta ou dos seus dados, a equipe apaga na hora, sem
            passar pela lixeira. Alguns registros, como os financeiros, podem ser mantidos pelo
            prazo que a lei exigir. O registro de atividades é apagado automaticamente depois de 12
            meses. A liderança também faz cópias de segurança (backup) dos dados, guardadas em local
            restrito.
          </p>
        </Section>

        <Section title="Seus direitos">
          <p>Você pode, a qualquer momento, pedir à igreja para:</p>
          <Bullets
            items={[
              "confirmar se tratamos seus dados e acessá-los;",
              "corrigir dados incompletos ou errados (você mesmo pode editar o seu cadastro na área de membros);",
              "pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados sem consentimento;",
              "receber seus dados em formato que possa levar a outro serviço (portabilidade);",
              "saber com quem compartilhamos seus dados;",
              "excluir os dados tratados com o seu consentimento e retirar esse consentimento, sabendo que algumas funções (como entrar na área de membros) deixam de estar disponíveis.",
            ]}
          />
          <p>Responderemos o mais rápido possível, em até 15 dias.</p>
        </Section>

        <Section title="Crianças e adolescentes">
          <p>
            O cadastro e a inscrição de menores de 18 anos devem ser feitos ou autorizados por pai,
            mãe ou responsável legal, sempre no melhor interesse da criança ou do adolescente.
          </p>
        </Section>

        <Section title="Segurança">
          <p>
            Protegemos os dados com acesso por login e senha, permissões diferentes para cada
            função, conexão protegida (HTTPS) e registro das alterações importantes. Nenhum sistema
            é totalmente imune a falhas; se houver um incidente que possa trazer risco a você, vamos
            avisá-lo e comunicar a Autoridade Nacional de Proteção de Dados, como a lei determina.
          </p>
        </Section>

        <Section title="Mudanças nesta política">
          <p>
            Podemos atualizar este texto. Sempre que houver mudança relevante, a data no início
            desta página será alterada e, se necessário, pediremos um novo consentimento.
          </p>
        </Section>

        <Section title="Fale com a gente">
          <p>
            Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale com a equipe da{" "}
            {c.name}:
          </p>
          <Bullets
            items={[
              ...(c.email
                ? [
                    <a key="mail" className="text-primary underline" href={`mailto:${c.email}`}>
                      {c.email}
                    </a>,
                  ]
                : []),
              ...(c.phone ? [<span key="tel">{c.phone}</span>] : []),
              ...(whatsapp
                ? [
                    <a
                      key="wa"
                      className="text-primary underline"
                      href={whatsapp}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>,
                  ]
                : []),
              <span key="pg">
                Pela página{" "}
                <a className="text-primary underline" href="/contato">
                  Contato
                </a>
                , ou pessoalmente em {c.address}, {c.city}.
              </span>,
            ]}
          />
        </Section>
      </article>
    </SiteLayout>
  );
}
