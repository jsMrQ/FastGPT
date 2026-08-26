import React, { useMemo } from 'react';
import { Box, type BoxProps, Flex, Link, type LinkProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import NextLink from 'next/link';
import Badge from '../Badge';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

export enum NavbarTypeEnum {
  normal = 'normal',
  small = 'small'
}

const itemStyles: BoxProps & LinkProps = {
  my: 2,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  w: '48px',
  h: '58px',
  borderRadius: 'md'
};
const hoverStyle: LinkProps = {
  _hover: {
    bg: 'rgba(255, 255, 255, 0.08)',
    color: '#5EEAD4'
  }
};

const Navbar = ({ unread }: { unread: number }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { lastChatAppId, lastPane } = useChatStore();

  const navbarList = useMemo(
    () => [
      {
        label: t('common:navbar.Chat'),
        icon: 'navbar/chatLight',
        activeIcon: 'navbar/chatFill',
        link: `/chat?appId=${lastChatAppId}&pane=${lastPane}`,
        activeLink: ['/chat']
      },
      {
        label: t('common:navbar.Studio'),
        icon: 'navbar/dashboardLight',
        activeIcon: 'navbar/dashboardFill',
        link: `/dashboard/agent`,
        activeLink: [
          '/dashboard/agent',
          '/dashboard/create',
          '/app/detail',
          '/dashboard/skill',
          '/skill/detail',
          '/dashboard/tool',
          '/dashboard/systemTool',
          '/dashboard/templateMarket',
          '/dashboard/mcpServer',
          '/dashboard/evaluation',
          '/dashboard/evaluation/create'
        ]
      },
      {
        label: t('common:navbar.Datasets'),
        icon: 'navbar/datasetLight',
        activeIcon: 'navbar/datasetFill',
        link: `/dataset/list`,
        activeLink: ['/dataset/list', '/dataset/detail']
      },
      {
        label: t('common:navbar.Account'),
        icon: 'navbar/userLight',
        activeIcon: 'navbar/userFill',
        link: '/account/info',
        activeLink: [
          '/account/bill',
          '/account/info',
          '/account/customDomain',
          '/account/team',
          '/account/usage',
          '/account/thirdParty',
          '/account/apikey',
          '/account/setting',
          '/account/inform',
          '/account/promotion',
          '/account/model'
        ]
      }
    ],
    [lastChatAppId, lastPane, t]
  );

  return (
    <Flex
      flexDirection={'column'}
      alignItems={'center'}
      pt={6}
      h={'100%'}
      w={'100%'}
      userSelect={'none'}
      pb={2}
      bg={'#0B1F1C'}
      borderRight={'1px solid rgba(94, 234, 212, 0.08)'}
    >
      <Box flex={1}>
        {navbarList.map((item) => {
          const isActive = item.activeLink.includes(router.pathname);

          return (
            <Box
              key={item.link}
              {...itemStyles}
              {...(isActive
                ? {
                    bg: 'rgba(15, 118, 110, 0.35)',
                    boxShadow: 'inset 0 0 0 1px rgba(94, 234, 212, 0.22)'
                  }
                : {
                    bg: 'transparent',
                    _hover: {
                      bg: 'rgba(255, 255, 255, 0.06)'
                    }
                  })}
              {...(item.link !== router.asPath
                ? {
                    onClick: () => {
                      if (item.link.startsWith('/chat')) {
                        window.open(getWebReqUrl(item.link), '_blank', 'noopener,noreferrer');
                        return;
                      }
                      router.push(item.link);
                    }
                  }
                : {})}
            >
              <MyIcon
                {...(isActive
                  ? {
                      name: item.activeIcon as any,
                      color: '#5EEAD4'
                    }
                  : {
                      name: item.icon as any,
                      color: 'rgba(204, 251, 241, 0.55)'
                    })}
                width={'24px'}
                height={'24px'}
              />
              <Box
                fontSize={'12px'}
                transform={'scale(0.9)'}
                mt={'5px'}
                lineHeight={1}
                color={isActive ? '#99F6E4' : 'rgba(204, 251, 241, 0.65)'}
              >
                {item.label}
              </Box>
            </Box>
          );
        })}
      </Box>

      {unread > 0 && (
        <Box>
          <Link
            as={NextLink}
            {...itemStyles}
            {...hoverStyle}
            prefetch
            href={`/account/inform`}
            mb={0}
            color={'rgba(204, 251, 241, 0.65)'}
            height={'48px'}
          >
            <Badge count={unread}>
              <MyIcon name={'support/user/informLight'} width={'22px'} height={'22px'} />
            </Badge>
          </Link>
        </Box>
      )}

      <Box flex={'0 0 auto'} mb={4} cursor={'pointer'} onClick={() => router.push('/account/info')}>
        <Avatar
          w={9}
          src={userInfo?.avatar}
          borderRadius={'50%'}
          border={'1px solid rgba(94, 234, 212, 0.25)'}
        />
      </Box>
    </Flex>
  );
};

export default Navbar;
