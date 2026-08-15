import React from 'react';
import { ScrollView, View, Text, Linking, TouchableOpacity } from 'react-native';

const UPDATED = '15 de agosto de 2026';
const CONTACT = 'soporte@osmscout.app'; // TODO: replace with the real support address

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View className="mb-7">
            <Text className="text-white font-black text-base mb-2">{title}</Text>
            {children}
        </View>
    );
}

function P({ children }: { children: React.ReactNode }) {
    return <Text className="text-slate-300 text-[13px] leading-6 mb-2">{children}</Text>;
}

function Item({ children }: { children: React.ReactNode }) {
    return (
        <View className="flex-row mb-1.5 pl-1">
            <Text className="text-emerald-400 mr-2">•</Text>
            <Text className="text-slate-300 text-[13px] leading-6 flex-1">{children}</Text>
        </View>
    );
}

export default function TermsOfService() {
    return (
        <ScrollView className="flex-1 bg-[#020617]" contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
            <View className="w-full max-w-3xl self-center">
                <Text className="text-white font-black text-3xl tracking-tighter mb-1">
                    Condiciones del Servicio
                </Text>
                <Text className="text-slate-500 text-xs mb-8">Última actualización: {UPDATED}</Text>

                <Section title="Objeto">
                    <P>
                        OSM Scout Pro es una herramienta de análisis y scouting para jugadores de Online
                        Soccer Manager. Al usarla aceptas estas condiciones.
                    </P>
                </Section>

                <Section title="Relación con Online Soccer Manager">
                    <P>
                        Este servicio es independiente y no está afiliado, patrocinado ni respaldado por
                        Online Soccer Manager ni por Gamebasics B.V. Todas las marcas mencionadas pertenecen
                        a sus respectivos titulares.
                    </P>
                    <P>
                        Los datos de jugadores se ofrecen con fines informativos. No garantizamos que
                        coincidan en todo momento con los del juego ni que su uso produzca ningún resultado
                        concreto dentro de él.
                    </P>
                </Section>

                <Section title="Planes y pagos">
                    <Item>
                        El plan gratuito incluye un número limitado de búsquedas diarias y de filtros
                        guardados.
                    </Item>
                    <Item>
                        El plan mensual se renueva automáticamente hasta que lo canceles. El plan vitalicio
                        es un pago único.
                    </Item>
                    <Item>
                        Los pagos se procesan a través de Google Play (Android) o Stripe (web). Las
                        cancelaciones y reembolsos se rigen por las condiciones de la plataforma donde
                        compraste.
                    </Item>
                    <Item>
                        Puedes cancelar la renovación en cualquier momento desde los ajustes de tu cuenta de
                        Google Play o desde el portal de facturación de Stripe.
                    </Item>
                </Section>

                <Section title="Tu cuenta">
                    <P>
                        Puedes usar la aplicación de forma anónima. Si vinculas una cuenta de Google, eres
                        responsable de mantener su seguridad. Sin una cuenta vinculada no podemos garantizar
                        la recuperación de tu compra si pierdes el acceso al dispositivo o borras los datos
                        de la aplicación.
                    </P>
                </Section>

                <Section title="Uso aceptable">
                    <P>No está permitido:</P>
                    <Item>Automatizar o extraer masivamente los datos del servicio.</Item>
                    <Item>Revender o redistribuir el contenido sin autorización.</Item>
                    <Item>Eludir los límites del plan gratuito o los mecanismos de pago.</Item>
                    <Item>Interferir con el funcionamiento del servicio o de su infraestructura.</Item>
                    <P>
                        Podemos suspender el acceso de las cuentas que incumplan estas condiciones.
                    </P>
                </Section>

                <Section title="Disponibilidad">
                    <P>
                        Trabajamos para mantener el servicio disponible, pero no garantizamos que funcione
                        de forma ininterrumpida ni libre de errores. Podemos modificar o discontinuar
                        funciones; si una modificación afecta de forma sustancial a un plan de pago vigente,
                        lo avisaremos con antelación.
                    </P>
                </Section>

                <Section title="Limitación de responsabilidad">
                    <P>
                        En la medida permitida por la ley, nuestra responsabilidad se limita al importe que
                        hayas pagado por el servicio en los doce meses anteriores. Nada en estas condiciones
                        excluye los derechos que te correspondan como consumidor.
                    </P>
                </Section>

                <Section title="Cambios">
                    <P>
                        Podemos actualizar estas condiciones. La fecha del encabezado indica la última
                        revisión y los cambios relevantes se anunciarán dentro de la aplicación.
                    </P>
                </Section>

                <Section title="Contacto">
                    <TouchableOpacity onPress={() => Linking.openURL(`mailto:${CONTACT}`)}>
                        <Text className="text-emerald-400 text-[13px] underline">{CONTACT}</Text>
                    </TouchableOpacity>
                </Section>
            </View>
        </ScrollView>
    );
}
