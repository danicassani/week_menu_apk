-- Match client mass/volume rounding for sub-gram seasoning shares.
-- Existing owners, grants, context checks and full portion validation are retained.
do $rounding$
declare definition text; old_text text;begin
 definition:=pg_get_functiondef('app_private.transfer_portion(text,uuid,date,text,boolean)'::regprocedure);
 old_text:='scaled:=scaled*1000;step:=case when scaled>=10 then 10 else 1 end;quantity:=round(scaled/step)*step/1000;';
 if position(old_text in definition)=0 then raise exception 'small_weight_definition_mismatch';end if;
 definition:=replace(definition,old_text,'scaled:=scaled*1000;step:=case when scaled>=10 then 10 when scaled<1 then 0.1 else 1 end;quantity:=greatest(round(scaled/step)*step,step)/1000;');
 old_text:='case when scaled>=10 then 10 else 1 end else coalesce';
 if position(old_text in definition)=0 then raise exception 'small_weight_definition_mismatch';end if;
 definition:=replace(definition,old_text,'case when scaled>=10 then 10 when scaled<1 then 0.1 else 1 end else coalesce');
 old_text:='if step<=0 then raise exception ''invalid_quantity'';end if;quantity:=round(scaled/step)*step;';
 if position(old_text in definition)=0 then raise exception 'small_weight_definition_mismatch';end if;
 definition:=replace(definition,old_text,old_text||' if unit in(''g'',''ml'') and scaled<1 then quantity:=greatest(quantity,0.1);end if;');
 execute definition;
end$rounding$;
