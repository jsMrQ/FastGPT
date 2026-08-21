import { postCreateTeamAccount } from '@/web/support/user/team/api';
import { getOrgList } from '@/web/support/user/team/org/api';
import {
  Box,
  Button,
  Grid,
  Input,
  ModalBody,
  ModalCloseButton,
  ModalFooter
} from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useToast } from '@fastgpt/web/hooks/useToast';

type FormType = {
  username: string;
  password: string;
  memberName: string;
  orgId: string;
};

function CreateAccountModal({
  onSuccess,
  onClose
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [orgOptions, setOrgOptions] = useState<Array<{ label: string; value: string }>>([
    { label: t('account_team:create_account_no_org'), value: '' }
  ]);

  const { register, handleSubmit, setValue, watch } = useForm<FormType>({
    defaultValues: {
      username: '',
      password: '',
      memberName: '',
      orgId: ''
    }
  });
  const orgId = watch('orgId');

  useEffect(() => {
    getOrgList({ orgId: '', withPermission: false })
      .then((list) => {
        setOrgOptions([
          { label: t('account_team:create_account_no_org'), value: '' },
          ...list.map((item) => ({
            label: item.name,
            value: String(item._id)
          }))
        ]);
      })
      .catch(() => {
        // 部门列表失败时仍可开通账号（不挂部门）
      });
  }, [t]);

  const { runAsync: onCreate, loading } = useRequest(
    async (data: FormType) => {
      return postCreateTeamAccount({
        username: data.username.trim(),
        password: data.password.trim() || undefined,
        memberName: data.memberName.trim(),
        orgId: data.orgId || undefined
      });
    },
    {
      manual: true,
      errorToast: t('common:create_failed'),
      onSuccess: (res) => {
        toast({
          status: 'success',
          title: res.generatedPassword
            ? t('account_team:create_account_success_with_password', {
                password: res.generatedPassword
              })
            : t('account_team:create_account_success')
        });
        onSuccess();
        onClose();
      }
    }
  );

  const orgSelectList = useMemo(() => orgOptions, [orgOptions]);

  return (
    <MyModal
      isOpen
      iconSrc="common/addLight"
      iconColor="primary.500"
      title={<Box>{t('account_team:create_account')}</Box>}
    >
      <ModalCloseButton onClick={onClose} />
      <ModalBody>
        <Grid gap={6} templateColumns="max-content 1fr" alignItems="center">
          <>
            <FormLabel required>{t('account_team:create_account_username')}</FormLabel>
            <Input
              placeholder={t('account_team:create_account_username_placeholder')}
              {...register('username', { required: true, minLength: 2 })}
            />
          </>
          <>
            <FormLabel required>{t('account_team:create_account_member_name')}</FormLabel>
            <Input
              placeholder={t('account_team:create_account_member_name_placeholder')}
              {...register('memberName', { required: true, minLength: 1 })}
            />
          </>
          <>
            <FormLabel>{t('account_team:create_account_password')}</FormLabel>
            <Input
              type="password"
              placeholder={t('account_team:create_account_password_placeholder')}
              {...register('password', { minLength: 6 })}
            />
          </>
          <>
            <FormLabel>{t('account_team:create_account_org')}</FormLabel>
            <MySelect
              list={orgSelectList}
              value={orgId}
              onChange={(val) => setValue('orgId', val)}
              minW="120px"
            />
          </>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button isLoading={loading} onClick={onClose} variant="outline">
          {t('common:Cancel')}
        </Button>
        <Button isLoading={loading} onClick={handleSubmit(onCreate)} ml="4">
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default CreateAccountModal;
