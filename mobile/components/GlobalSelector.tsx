import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useStore } from '../context/StoreContext';

export const GlobalSelector = () => {
    const { selectModal, setSelectModal } = useStore();

    if (!selectModal.isOpen) return null;

    return (
        <Modal
            transparent
            visible={selectModal.isOpen}
            animationType="fade"
            onRequestClose={() => setSelectModal((prev: any) => ({ ...prev, isOpen: false }))}
        >
            <View className="flex-1 bg-black/60 justify-end">
                <TouchableOpacity 
                    className="flex-1" 
                    activeOpacity={1} 
                    onPress={() => setSelectModal((prev: any) => ({ ...prev, isOpen: false }))} 
                />
                <View className="bg-[#0a0f26] rounded-t-3xl max-h-[70%] border-t border-indigo-500/20">
                    <View className="p-6 border-b border-white/5 flex-row justify-between items-center">
                        <Text className="text-white font-black text-xl">{selectModal.title.toUpperCase()}</Text>
                        <TouchableOpacity onPress={() => setSelectModal((prev: any) => ({ ...prev, isOpen: false }))}>
                            <View className="bg-white/5 w-8 h-8 rounded-full items-center justify-center">
                                <Text className="text-white font-bold">✕</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                    <ScrollView className="p-4">
                        <View className="flex-row flex-wrap gap-2 pb-10">
                            {selectModal.items.map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    onPress={() => {
                                        selectModal.onSelect(item);
                                        setSelectModal((prev: any) => ({ ...prev, isOpen: false }));
                                    }}
                                    className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl min-w-[45%]"
                                >
                                    <Text className="text-slate-300 font-bold text-center">
                                        {selectModal.renderLabel(item)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};
