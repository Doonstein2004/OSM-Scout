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

export default function PrivacyPolicy() {
    return (
        <ScrollView className="flex-1 bg-[#020617]" contentContainerStyle={{ padding: 24, paddingBottom: 64 }}>
            <View className="w-full max-w-3xl self-center">
                <Text className="text-white font-black text-3xl tracking-tighter mb-1">
                    Política de Privacidad
                </Text>
                <Text className="text-slate-500 text-xs mb-8">Última actualización: {UPDATED}</Text>

                <Section title="Quiénes somos">
                    <P>
                        OSM Scout Pro es una herramienta de scouting para Online Soccer Manager. Esta
                        política explica qué datos tratamos, por qué y con quién los compartimos.
                    </P>
                    <P>
                        No estamos afiliados a Online Soccer Manager ni a Gamebasics B.V.
                    </P>
                </Section>

                <Section title="Datos que tratamos">
                    <P>Solo tratamos lo necesario para que la aplicación funcione:</P>
                    <Item>
                        <Text className="text-white font-bold">Identificador anónimo.</Text> Al abrir la
                        aplicación se crea una sesión anónima. No pedimos ningún dato personal para empezar
                        a usarla.
                    </Item>
                    <Item>
                        <Text className="text-white font-bold">Cuenta de Google (opcional).</Text> Si
                        decides vincular tu cuenta, recibimos tu dirección de correo, tu nombre y tu foto de
                        perfil. Sirve para que puedas recuperar tu compra si cambias de dispositivo o borras
                        los datos de la aplicación. Vincularla no es obligatorio.
                    </Item>
                    <Item>
                        <Text className="text-white font-bold">Identificador del dispositivo.</Text> En
                        Android usamos el identificador que el sistema asigna a la aplicación para contar las
                        búsquedas diarias del plan gratuito. No permite identificarte personalmente ni
                        rastrearte fuera de la aplicación.
                    </Item>
                    <Item>
                        <Text className="text-white font-bold">Compras.</Text> Guardamos el estado de tu
                        suscripción y el correo asociado al pago, para poder restaurarla. No vemos ni
                        almacenamos los datos de tu tarjeta en ningún momento.
                    </Item>
                    <Item>
                        <Text className="text-white font-bold">Uso.</Text> Registramos eventos agregados
                        (búsquedas realizadas, pantallas visitadas) para entender qué se usa y qué no.
                    </Item>
                </Section>

                <Section title="Con quién los compartimos">
                    <P>
                        No vendemos tus datos. Los proveedores siguientes los tratan por cuenta nuestra,
                        únicamente para prestar su servicio:
                    </P>
                    <Item><Text className="text-white font-bold">Supabase</Text> — autenticación y base de datos.</Item>
                    <Item><Text className="text-white font-bold">RevenueCat</Text> — gestión de suscripciones.</Item>
                    <Item><Text className="text-white font-bold">Stripe</Text> — pagos en la versión web.</Item>
                    <Item><Text className="text-white font-bold">Google Play</Text> — pagos en Android.</Item>
                    <Item><Text className="text-white font-bold">Vercel</Text> — alojamiento y analítica de la versión web.</Item>
                </Section>

                <Section title="Cuánto tiempo los conservamos">
                    <P>
                        El contador de búsquedas se reinicia cada día. Los datos de cuenta y de compra se
                        conservan mientras la cuenta exista; si la eliminas, se borran salvo lo que debamos
                        conservar por obligaciones fiscales o contables.
                    </P>
                </Section>

                <Section title="Tus derechos">
                    <P>
                        Puedes solicitar el acceso, la rectificación o la eliminación de tus datos, así como
                        oponerte a su tratamiento, escribiendo a {CONTACT}. Si estás en Brasil te amparan la
                        LGPD y, si estás en la Unión Europea, el RGPD.
                    </P>
                    <P>
                        También puedes desvincular tu cuenta de Google en cualquier momento desde la
                        configuración de tu cuenta de Google.
                    </P>
                </Section>

                <Section title="Menores">
                    <P>
                        La aplicación no está dirigida a menores de 13 años y no recogemos datos de forma
                        consciente de ellos.
                    </P>
                </Section>

                <Section title="Cambios">
                    <P>
                        Si modificamos esta política actualizaremos la fecha del encabezado. Los cambios
                        relevantes se anunciarán dentro de la aplicación.
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
