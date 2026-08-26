import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { LoginContainer } from '@/pageComponents/login';
import I18nLngSelector from '@/components/Select/I18nLngSelector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { type LoginSuccessResponseType } from '@fastgpt/global/openapi/support/user/account/login/api';

type LoginModalProps = {
  onSuccess: (e: LoginSuccessResponseType) => any;
};

const LoginModal = ({ onSuccess }: LoginModalProps) => {
  const { isPc } = useSystem();

  return (
    <Flex
      alignItems={'center'}
      justifyContent={'center'}
      bg={'#F3F7F6'}
      userSelect={'none'}
      minH={'100vh'}
      px={0}
      pt={0}
      pb={0}
      position={'relative'}
      overflow={'hidden'}
    >
      {/* 墨青径向光晕 */}
      <Box
        position={'absolute'}
        top={'-120px'}
        left={'50%'}
        w={['900px', '1100px']}
        h={['480px', '520px']}
        transform={'translateX(-50%)'}
        pointerEvents={'none'}
        bg={'radial-gradient(ellipse at center, rgba(15, 118, 110, 0.22), transparent 68%)'}
      />
      <Box
        position={'absolute'}
        bottom={'-10%'}
        left={'50%'}
        w={['100%', '70%']}
        h={['35%', '40%']}
        transform={'translateX(-50%)'}
        pointerEvents={'none'}
        bg={'radial-gradient(ellipse at center, rgba(13, 148, 136, 0.1), transparent 70%)'}
      />
      {/* 极淡网格 */}
      <Box
        position={'absolute'}
        inset={0}
        pointerEvents={'none'}
        opacity={0.55}
        bgImage={
          'linear-gradient(rgba(15, 94, 89, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 94, 89, 0.04) 1px, transparent 1px)'
        }
        bgSize={'48px 48px'}
      />

      {isPc && (
        <Box position="absolute" top="24px" right="24px" zIndex={10}>
          <I18nLngSelector />
        </Box>
      )}

      <Flex
        position="relative"
        alignItems={'center'}
        justifyContent={'center'}
        w={'100%'}
        maxW={['100%', '1328px']}
        h={'100vh'}
        minH={['100vh', '720px']}
        overflow={'hidden'}
        zIndex={1}
      >
        <Flex
          flexDirection={'column'}
          w={['100%', '560px']}
          h={['100%', 'auto']}
          bg={['transparent', 'white']}
          px={['8', '90px']}
          py={['38px', '90px']}
          borderRadius={[0, '12px']}
          border={['none', '1px solid rgba(15, 94, 89, 0.08)']}
          boxShadow={[
            '',
            '0px 16px 40px rgba(15, 94, 89, 0.10), 0px 1px 3px rgba(11, 31, 28, 0.06)'
          ]}
          position="relative"
          zIndex={1}
        >
          <LoginContainer onSuccess={onSuccess} />
        </Flex>
      </Flex>
    </Flex>
  );
};

export default LoginModal;
