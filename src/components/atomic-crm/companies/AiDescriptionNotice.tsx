import { Sparkles } from "lucide-react";

/**
 * Mention signalant qu'un descriptif a été rédigé par un modèle (NOS-1149).
 *
 * Un descriptif produit par IA est une **inférence** : plausible, souvent
 * juste, parfois fausse. Celui qui le lit avant d'appeler un client doit
 * savoir lequel des deux statuts il a sous les yeux — c'est la différence
 * entre citer une source et répéter une supposition.
 *
 * Discrète à dessein. Elle informe, elle ne met pas en garde : ces descriptifs
 * ne sont pas produits au hasard, et le modèle a pour consigne de se taire
 * plutôt que d'inventer quand il ne connaît pas la société. Un bandeau
 * d'avertissement sur les deux tiers des fiches finirait ignoré, et
 * décrédibiliserait au passage les vrais avertissements de l'interface.
 *
 * Partagée par la fiche société et l'encadré « Le client » de la fiche
 * opportunité : deux formulations différentes pour le même statut, et le
 * lecteur se demanderait ce qui les distingue.
 */
export const AiDescriptionNotice = ({
  className = "",
}: {
  className?: string;
}) => (
  <span
    className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className}`}
    title="Ce descriptif a été rédigé par un modèle à partir du nom et du site de la société. À vérifier avant de le reprendre auprès d'un client."
  >
    <Sparkles className="w-3 h-3 shrink-0" aria-hidden />
    Rédigé par IA
  </span>
);
